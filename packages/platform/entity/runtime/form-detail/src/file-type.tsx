import { FileTextIcon } from "@athyper/platform-icons";
const groups: Record<string,string> = {
  pdf:"PDF",png:"Image",jpg:"Image",jpeg:"Image",gif:"Image",webp:"Image",svg:"Image",bmp:"Image",tif:"Image",tiff:"Image",heic:"Image",avif:"Image",ico:"Image",
  doc:"Document",docx:"Document",odt:"Document",rtf:"Document",pages:"Document",
  xls:"Spreadsheet",xlsx:"Spreadsheet",xlsm:"Spreadsheet",csv:"Spreadsheet",tsv:"Spreadsheet",ods:"Spreadsheet",numbers:"Spreadsheet",
  ppt:"Presentation",pptx:"Presentation",odp:"Presentation",key:"Presentation",
  zip:"Archive",rar:"Archive","7z":"Archive",tar:"Archive",gz:"Archive",bz2:"Archive",
  mp3:"Audio",wav:"Audio",ogg:"Audio",flac:"Audio",aac:"Audio",m4a:"Audio",
  mp4:"Video",mov:"Video",avi:"Video",webm:"Video",mkv:"Video",m4v:"Video",
  txt:"Text",md:"Text",log:"Text",json:"Code",xml:"Code",html:"Code",htm:"Code",css:"Code",js:"Code",ts:"Code",tsx:"Code",jsx:"Code",py:"Code",sql:"Code",yaml:"Code",yml:"Code",sh:"Code",
  eml:"Email",msg:"Email",ics:"Calendar",vcf:"Contact",
};
export function FileTypeIcon({name,contentType}:{name:string;contentType?:string}) {
  const ext=name.includes(".")?name.split(".").pop()!.toLowerCase():"";
  const kind=groups[ext]??(contentType?.startsWith("image/")?"Image":contentType?.startsWith("audio/")?"Audio":contentType?.startsWith("video/")?"Video":contentType==="application/pdf"?"PDF":"File");
  const paths:Record<string,string>={Image:"M3 3h18v18H3z M3 17l6-6 4 4 3-3 5 5 M8 7h.01",Spreadsheet:"M3 3h18v18H3z M3 9h18 M3 15h18 M9 3v18",Presentation:"M3 3h18v13H3z M12 16v5 M7 21l5-5 5 5 M7 12V9 M12 12V6 M17 12V8",Audio:"M9 18V5l12-2v13 M9 8l12-2 M3 18a3 2 0 1 0 6 0a3 2 0 1 0-6 0 M15 16a3 2 0 1 0 6 0a3 2 0 1 0-6 0",Video:"M3 4h18v16H3z M10 8l6 4-6 4z",Archive:"M4 3h16v18H4z M11 3h2v3h-2v3h2v3h-2v3h2v3h-2",Code:"M8 6l-6 6 6 6 M16 6l6 6-6 6 M14 3l-4 18",Email:"M3 5h18v14H3z M3 5l9 8 9-8",Calendar:"M3 5h18v16H3z M3 10h18 M7 2v6 M17 2v6"};
  return <span className="a-file-type-icon" role="img" aria-label={`${kind}${ext?` (${ext.toUpperCase()})`:""}`} title={`${kind}${ext?` · ${ext.toUpperCase()}`:""}`}>
    {paths[kind]?<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]}/></svg>:<FileTextIcon size={22} aria-hidden="true"/>}
    <span aria-hidden="true">{ext?ext.slice(0,5).toUpperCase():kind.toUpperCase()}</span>
  </span>;
}
