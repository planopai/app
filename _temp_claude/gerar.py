from PIL import Image, ImageFilter, ImageDraw
import os,sys
X=os.path.expanduser('~/x'); OUT=os.path.expanduser('~/mnt/Plano PAI/CATÁLOGO NORDESTE ')
S=2000; TOP=(86,157,192); BOT=(186,217,232)
def fundo():
    g=Image.new('RGB',(1,S))
    for y in range(S):
        t=y/(S-1); g.putpixel((0,y),tuple(round(TOP[i]+(BOT[i]-TOP[i])*t) for i in range(3)))
    return g.resize((S,S))
BG=fundo()
def cut(p,a):
    im=Image.open(f'{X}/p{p}-{a:03d}.png').convert('RGB'); mk=Image.open(f'{X}/p{p}-{a+1:03d}.png').convert('L')
    if mk.size!=im.size: mk=mk.resize(im.size)
    im.putalpha(mk); return im.crop(mk.point(lambda v:255 if v>8 else 0).getbbox())
def compor(im):
    w=int(S*0.90); h=int(im.height*w/im.width)
    if h>S*0.80: h=int(S*0.80); w=int(im.width*h/im.height)
    im=im.resize((w,h),Image.LANCZOS)
    x=(S-w)//2; y=(S-h)//2+40
    base=BG.copy()
    a=im.split()[3]; sh=Image.new('L',(S,S),0); sh.paste(a.point(lambda v:int(v*0.45)),(x+25,y+45))
    sh=sh.filter(ImageFilter.GaussianBlur(35))
    base.paste(Image.new('RGB',(S,S),(40,70,90)),(0,0),sh)
    base.paste(im,(x,y),im); return base
def detalhe(path):
    im=Image.open(path).convert('RGB'); r=min(S*0.85/im.width,S*0.85/im.height); im=im.resize((int(im.width*r),int(im.height*r)),Image.LANCZOS)
    base=BG.copy(); base.paste(im,((S-im.width)//2,(S-im.height)//2)); return base
M=[('ES000 (ALÇA DURA SEM VISOR)',27,[7,5][::-1]),
   ('ES001 (ALÇA BILONGA PIGMENTADA)',26,[7,5]),
   ('ES008.1 UNIPAX - SOMBRA CEREJEIRA',22,[7,5]),
   ('ES008 (BRANCA)',23,[5,7]),
   ('ES035',17,[7,5]),('ES017',15,[7,5]),('ES119',16,[7,5]),('ES047',14,[7,5])]
for nome,p,ordem in M:
    fotos=[compor(cut(p,a)) for a in ordem]
    if p==16: fotos+= [detalhe(f'{X}/p16-009.png'),detalhe(f'{X}/p16-010.png')]
    for i,f in enumerate(fotos,1):
        f.save(f'{OUT}/{nome} - {i}.jpg',quality=88,optimize=True)
    print(nome,len(fotos))
