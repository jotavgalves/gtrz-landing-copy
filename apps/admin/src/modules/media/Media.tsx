import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { API_BASE, api } from '../../lib/api';
import { Badge, Empty, Notice, Panel } from '../../components/StateViews';
import { Icon } from '../../components/Icons';

type Asset={id:string;file_name:string;mime_type:string;size_bytes:number;width?:number;height?:number;alt_pt?:string;alt_es?:string;created_at:string;usage_count?:number};
type PreparedImage={main:File;card:File|null;width:number;height:number;originalBytes:number};

const OPTIMIZABLE_TYPES=new Set(['image/jpeg','image/png','image/webp']);
const MAIN_MAX_DIMENSION=1920;
const CARD_MAX_DIMENSION=1280;
const MAIN_QUALITY=.84;
const CARD_QUALITY=.80;

const webpName=(name:string)=>`${name.replace(/\.[^.]+$/,'')||'asset'}.webp`;
const canvasToBlob=(canvas:HTMLCanvasElement,quality:number)=>new Promise<Blob>((resolve,reject)=>{
  canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Falha ao otimizar a imagem.')),'image/webp',quality);
});

async function prepareImage(file:File):Promise<PreparedImage>{
  if(!OPTIMIZABLE_TYPES.has(file.type))return {main:file,card:null,width:0,height:0,originalBytes:file.size};
  const bitmap=await createImageBitmap(file);
  try{
    const originalWidth=bitmap.width;
    const originalHeight=bitmap.height;
    const render=async(maxDimension:number,quality:number)=>{
      const ratio=Math.min(1,maxDimension/Math.max(originalWidth,originalHeight));
      const width=Math.max(1,Math.round(originalWidth*ratio));
      const height=Math.max(1,Math.round(originalHeight*ratio));
      const canvas=document.createElement('canvas');
      canvas.width=width;
      canvas.height=height;
      const context=canvas.getContext('2d',{alpha:true});
      if(!context)throw new Error('O navegador não conseguiu preparar a imagem.');
      context.imageSmoothingEnabled=true;
      context.imageSmoothingQuality='high';
      context.drawImage(bitmap,0,0,width,height);
      const blob=await canvasToBlob(canvas,quality);
      return {blob,width,height};
    };
    const mainResult=await render(MAIN_MAX_DIMENSION,MAIN_QUALITY);
    const main=new File([mainResult.blob],webpName(file.name),{type:'image/webp',lastModified:Date.now()});
    let card:File|null=null;
    if(Math.max(mainResult.width,mainResult.height)>CARD_MAX_DIMENSION){
      const cardResult=await render(CARD_MAX_DIMENSION,CARD_QUALITY);
      card=new File([cardResult.blob],webpName(file.name),{type:'image/webp',lastModified:Date.now()});
    }
    return {main,card,width:mainResult.width,height:mainResult.height,originalBytes:file.size};
  }finally{
    bitmap.close();
  }
}

export function Media(){
  const [assets,setAssets]=useState<Asset[]>([]);const [file,setFile]=useState<File|null>(null);const [altPt,setAltPt]=useState('');const [altEs,setAltEs]=useState('');const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [query,setQuery]=useState('');const [selected,setSelected]=useState<Asset|null>(null);const [editing,setEditing]=useState<Asset|null>(null);
  const load=()=>api<any>('/api/media').then(r=>{setAssets(r.results||[]);if(selected){const fresh=(r.results||[]).find((x:Asset)=>x.id===selected.id);if(fresh)setSelected(fresh)}}).catch(e=>setMessage(e.message));
  useEffect(()=>{load();},[]);
  const filtered=useMemo(()=>assets.filter(a=>!query||`${a.file_name} ${a.alt_pt||''} ${a.alt_es||''}`.toLowerCase().includes(query.toLowerCase())),[assets,query]);
  const upload=async(e:FormEvent)=>{e.preventDefault();if(!file)return;setBusy(true);setMessage('');try{const prepared=await prepareImage(file);const form=new FormData();form.set('file',prepared.main);if(prepared.card)form.set('cardFile',prepared.card);form.set('altPt',altPt);form.set('altEs',altEs);form.set('width',String(prepared.width||''));form.set('height',String(prepared.height||''));await api('/api/media',{method:'POST',body:form});const before=(prepared.originalBytes/1024).toFixed(0);const after=(prepared.main.size/1024).toFixed(0);setFile(null);setAltPt('');setAltEs('');setMessage(`Imagem otimizada e enviada. ${before} KB → ${after} KB${prepared.card?' + versão leve para cards.':'.'}`);await load()}catch(err:any){setMessage(err.message)}finally{setBusy(false)}};
  const saveAsset=async()=>{if(!editing)return;setBusy(true);try{await api(`/api/media/${editing.id}`,{method:'PATCH',body:JSON.stringify({fileName:editing.file_name,altPt:editing.alt_pt||'',altEs:editing.alt_es||''})});setMessage('Metadados da imagem salvos.');setEditing(null);await load()}catch(e:any){setMessage(e.message)}finally{setBusy(false)}};
  const deleteAsset=async(asset:Asset)=>{if(!confirm(`Excluir “${asset.file_name}” permanentemente da biblioteca?`))return;setBusy(true);try{await api(`/api/media/${asset.id}`,{method:'DELETE'});setSelected(null);setEditing(null);setMessage('Imagem removida da biblioteca.');await load()}catch(e:any){setMessage(e.message==='media_in_use'?'Esta imagem está em uso no site, evento ou equipe. Remova as referências antes de excluir.':e.message)}finally{setBusy(false)}};
  const choose=(asset:Asset)=>{setSelected(asset);setEditing({...asset})};
  return <div className="module-stack"><Panel title="Biblioteca de mídia" eyebrow="Cloudflare R2" description="Assets oficiais utilizados pelo institucional, eventos, equipe e metadados sociais." action={<label className="search-box media-search"><Icon name="search" size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar imagem…"/></label>}>
    {message&&<Notice tone={message.toLowerCase().includes('uso')||message.toLowerCase().includes('erro')||message.toLowerCase().includes('falha')?'error':'success'}>{message}</Notice>}
    <div className="media-layout"><div className="media-main"><form className="media-upload" onSubmit={upload}><div className="media-upload-head"><span className="upload-icon"><Icon name="plus"/></span><div><strong>Novo asset</strong><p>JPEG, PNG ou WebP · otimização automática para WebP até 1920 px + variante leve de até 1280 px para cards.</p></div></div><div className="form-grid"><label className="wide file-drop"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setFile(e.target.files?.[0]||null)} required/><Icon name="image" size={22}/><span>{file?file.name:'Selecionar imagem do computador'}</span><small>{file?`${(file.size/1024/1024).toFixed(2)} MB · será otimizada antes do envio`:'Clique para escolher o arquivo'}</small></label><label><span>Texto alternativo PT</span><input value={altPt} onChange={e=>setAltPt(e.target.value)} placeholder="Descrição acessível da imagem"/></label><label><span>Texto alternativo ES</span><input value={altEs} onChange={e=>setAltEs(e.target.value)} placeholder="Descripción accesible de la imagen"/></label></div><button className="primary" disabled={busy||!file}><Icon name="plus" size={15}/>{busy?'Otimizando e enviando…':'Enviar para biblioteca'}</button></form>{filtered.length?<div className="media-grid premium-media-grid">{filtered.map(asset=><button type="button" className={`media-tile ${selected?.id===asset.id?'selected':''}`} key={asset.id} onClick={()=>choose(asset)}><div className="media-preview"><img src={`${API_BASE}/api/media/${asset.id}?variant=card`} alt={asset.alt_pt||''} loading="lazy" decoding="async"/><span className="media-usage">{asset.usage_count||0} usos</span></div><div className="media-meta"><strong>{asset.file_name}</strong><span>{asset.mime_type.replace('image/','').toUpperCase()} · {(asset.size_bytes/1024).toFixed(0)} KB</span></div></button>)}</div>:<Empty icon="media">A biblioteca ainda está vazia ou não há resultado para a busca.</Empty>}</div><aside className="media-inspector">{editing?<><div className="media-inspector-preview"><img src={`${API_BASE}/api/media/${editing.id}?variant=card`} alt="" decoding="async"/></div><div className="media-inspector-head"><div><Badge tone={(editing.usage_count||0)>0?'blue':'neutral'}>{editing.usage_count||0} USOS</Badge><h3>Detalhes do asset</h3></div><button className="icon-button" onClick={()=>{setSelected(null);setEditing(null)}}><Icon name="close"/></button></div><label className="field"><span>Nome do arquivo</span><input value={editing.file_name} onChange={e=>setEditing(v=>v?{...v,file_name:e.target.value}:v)}/></label><label className="field"><span>Alt text · Português</span><textarea value={editing.alt_pt||''} onChange={e=>setEditing(v=>v?{...v,alt_pt:e.target.value}:v)}/></label><label className="field"><span>Alt text · Español</span><textarea value={editing.alt_es||''} onChange={e=>setEditing(v=>v?{...v,alt_es:e.target.value}:v)}/></label><div className="asset-facts"><div><span>ID</span><code>{editing.id}</code></div><div><span>Formato</span><strong>{editing.mime_type}</strong></div><div><span>Tamanho</span><strong>{(editing.size_bytes/1024).toFixed(0)} KB</strong></div>{editing.width&&editing.height&&<div><span>Dimensões</span><strong>{editing.width} × {editing.height}</strong></div>}<div><span>Enviado</span><strong>{new Date(editing.created_at).toLocaleDateString('pt-BR')}</strong></div></div><button className="primary full" disabled={busy} onClick={saveAsset}><Icon name="save" size={15}/> Salvar metadados</button><button className="danger full" disabled={busy||(editing.usage_count||0)>0} onClick={()=>deleteAsset(editing)}><Icon name="trash" size={15}/> Excluir asset</button>{(editing.usage_count||0)>0&&<p className="hint">Para excluir, primeiro remova esta imagem de todos os lugares onde está sendo usada.</p>}</>:<div className="settings-empty"><Icon name="media" size={30}/><strong>Selecione um asset</strong><span>Veja usos, edite textos alternativos ou remova arquivos não utilizados.</span></div>}</aside></div>
  </Panel></div>;
}
