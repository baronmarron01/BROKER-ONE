export const MAX_DOCUMENT_BYTES=5*1024*1024;
export async function inspectDocument(file){
 if(!file || !file.size || file.size>MAX_DOCUMENT_BYTES)throw new Error('Choisissez un fichier non vide de 5 Mo maximum.');
 if(!file.name || file.name.length>180 || /[\x00-\x1f\x7f/\\]/.test(file.name))throw new Error('Nom de fichier invalide (180 caractères maximum).');
 const bytes=new Uint8Array(await file.arrayBuffer());
 let mime;
 if(bytes.slice(0,5).every((v,i)=>v===[37,80,68,70,45][i]) && bytes.length>=5)mime='application/pdf';
 else if(bytes.length>=8 && [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))mime='image/png';
 else if(bytes.length>=3 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255)mime='image/jpeg';
 else throw new Error('Format non reconnu. Utilisez un PDF, PNG ou JPEG.');
 if(file.type && file.type!==mime)throw new Error('Le contenu du fichier ne correspond pas à son type annoncé.');
 const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
 return {mime,sha256,size:bytes.length};
}
export async function verifyDocument(blob,expected){
 const bytes=new Uint8Array(await blob.arrayBuffer());
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
 if(bytes.length!==expected.byte_size || hash!==expected.sha256)throw new Error('Intégrité du fichier non confirmée. Téléchargement interrompu.');
}
