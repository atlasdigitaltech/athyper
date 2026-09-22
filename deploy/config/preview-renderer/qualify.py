"""Small real protocol fixtures; run inside the hardened sidecar after deployment."""
import io,json,urllib.request,urllib.error,time,base64
from PIL import Image,ImageDraw
im=Image.new('RGB',(320,180),'white')
ImageDraw.Draw(im).text((15,25),'CA09 clean fixture',fill='black')
f=io.BytesIO();im.save(f,'PNG')

def render(data,media,code,expected=200):
    boundary='ca09fixture'
    parts=[]
    for name,value in [('sourceContentType',media.encode()),('renditionCode',code.encode()),('specificationHash',b'0'*64),('content',data)]:
        parts.append(b'--'+boundary.encode()+b'\r\nContent-Disposition: form-data; name="'+name.encode()+b'"\r\n\r\n'+value+b'\r\n')
    body=b''.join(parts)+b'--'+boundary.encode()+b'--\r\n'
    t=time.monotonic()
    try:
        response=urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:3000/render',body,{'Content-Type':'multipart/form-data; boundary='+boundary}),timeout=30)
    except urllib.error.HTTPError as e:
        assert e.code == expected, (e.code,e.read())
        print(json.dumps(dict(media=media,rendition=code,status=e.code)))
        return
    assert response.status == expected
    value=json.load(response);data=base64.b64decode(value['bytes'],validate=True)
    if code=='preview_default': assert data.startswith(b'%PDF-')
    else:
        with Image.open(io.BytesIO(data)) as image: image.load(); assert image.width <= 1440 and image.height <= 1440
    print(json.dumps(dict(media=media,rendition=code,status=response.status,ms=round((time.monotonic()-t)*1000),bytes=len(data))))
    return data
pdf=render(f.getvalue(),'image/png','preview_default')
for code in ['thumbnail_sm','thumbnail_md','page_preview','preview_default']: render(pdf,'application/pdf',code)
render(b'not-an-office-file','application/msword','preview_default',422)
render(b'not-a-pdf','application/pdf','page_preview',422)
