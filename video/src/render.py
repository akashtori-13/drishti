import json, sys, numpy as np, cv2, subprocess, math
from PIL import Image
from lib import *
from scenes_a import SCENES_A
from scenes_b import SCENES_B
SC={**SCENES_A,**SCENES_B}
T=json.load(open('timing.json'))
ORDER=['I','II','III','IV']
FPS=30
# global timeline with leading-silence trim
G=[];off=0.0;AUD=[]
for k in ORDER:
    a=T[k]; tr=max(0,a['s0']-0.03)
    AUD.append((k,tr,a['dur']-tr,off))
    for c in a['cues']: G.append(dict(tag=c['tag'],text=c['text'],t0=c['t0']-tr+off,t1=c['t1']-tr+off,act=k))
    off+=a['dur']-tr
TOTAL=off
# scenes = runs of same tag (never merge across acts)
S=[]
for c in G:
    if S and S[-1]['tag']==c['tag'] and S[-1]['act']==c['act']: S[-1]['cues'].append(c)
    else: S.append(dict(tag=c['tag'],act=c['act'],cues=[c]))
for i,s in enumerate(S):
    s['start']=0.0 if i==0 else s['cues'][0]['t0']
    # acts start exactly at their offset
    if i>0 and S[i-1]['act']!=s['act']: s['start']=[o for (k,tr,d,o) in AUD if k==s['act']][0]
for i,s in enumerate(S):
    s['end']=S[i+1]['start'] if i+1<len(S) else TOTAL
    s['d']=s['end']-s['start']
    s['C']=[(c['t0']-s['start'],c['t1']-s['start']) for c in s['cues']]

def scene_at(t):
    for i,s in enumerate(S):
        if s['start']<=t<s['end']: return i
    return len(S)-1
CHAP={'I':('I  ·  WHO','The Inheritance'),'II':('II  ·  WHY','The Rule That Forgot How to See'),'III':('III  ·  WHAT','DRISHTI and DISTA'),'IV':('IV  ·  SO WHAT','The Potential')}
ACT_START={k:o for (k,tr,d,o) in AUD}
def draw_chapter(img,t):
    for k,(a,b) in CHAP.items():
        s=ACT_START[k]+(0.6 if k=='I' else 0.4); lt=t-s
        if 0<=lt<3.6:
            i=eo(seg(lt,0,0.5)); o=1-seg(lt,3.0,3.6)
            x=48-60*(1-i)
            rrect(img,x-12,H-92,max(10,textw(b,'m',22)+40+0,260),66,12,(10,8,6),-1,0.55*i*o)
            line(img,(x-12,H-92),(x-12,H-26),AM,4,i*o)
            text(img,a,x+6,H-72,'b',20,AM,'l',op=i*o); text(img,b,x+6,H-46,'m',22,WH,'l',op=i*o)
CAMS={'plates':(1.04,1.10,-20,0,0),'sphx':(1.12,1.03,0,12,0),'waste':(1.03,1.09,0,-22,0),'team':(1.05,1.09,22,0,0.6),
'throw':(1.05,1.10,-26,0,0),'n466':(1.0,1.0,0,0,0),'owl':(1.06,1.04,18,-6,-0.5),'reveal':(1.22,1.0,0,0,0),
'product':(1.04,1.09,0,-12,0),'roll':(1.05,1.05,0,0,1.6),'comet':(1.03,1.10,26,0,0),'keep':(1.06,1.03,0,12,0),
'pixel':(1.04,1.10,-18,8,0),'name':(1.0,1.0,0,0,0),'dcurve':(1.04,1.09,20,-8,0),'dpairs':(1.08,1.03,0,10,0),
'access':(1.04,1.09,-20,0,0),'nums':(1.04,1.08,0,-14,0),'ice':(1.03,1.09,16,0,-0.6),'finding':(1.0,1.0,0,0,0),'final':(1.0,1.0,0,0,0)}
def cam(img,tag,lt,d):
    # camera moves removed per director: locked-off slides, cuts do the work
    return img
def bloom(img):
    sm=cv2.resize(img,(320,180),interpolation=cv2.INTER_AREA).astype(np.float32)
    br=np.clip(sm-170,0,255); br=cv2.GaussianBlur(br,(0,0),7)
    up=cv2.resize(br,(W,H),interpolation=cv2.INTER_LINEAR)
    return np.clip(img.astype(np.float32)+up*0.45,0,255).astype(np.uint8)
def shift_rgb(img,k):
    out=img.copy(); out[:,:,2]=np.roll(img[:,:,2],k,axis=1); out[:,:,0]=np.roll(img[:,:,0],-k,axis=1); return out
def trans(A,B,p,kind):
    e=ease(p)
    if kind=='fade': return cv2.addWeighted(B,e,A,1-e,0)
    if kind=='zoom':
        M=cv2.getRotationMatrix2D((W/2,H/2),0,1+0.6*e); a=cv2.warpAffine(A,M,(W,H))
        M2=cv2.getRotationMatrix2D((W/2,H/2),0,0.8+0.2*e); b=cv2.warpAffine(B,M2,(W,H),borderMode=cv2.BORDER_REPLICATE)
        return cv2.addWeighted(b,e,a,1-e,0)
    if kind in('push_l','push_r'):
        s=int(eo(p)*W); out=np.empty_like(A)
        if kind=='push_l': out[:,:W-s]=A[:,s:]; out[:,W-s:]=B[:,:s]
        else: out[:,s:]=A[:,:W-s]; out[:,:s]=B[:,W-s:]
        return out
    if kind=='push_up':
        s=int(eo(p)*H); out=np.empty_like(A); out[:H-s]=A[s:]; out[H-s:]=B[:s]; return out
    if kind=='iris':
        m=np.zeros((H,W),np.uint8); cv2.circle(m,(W//2,H//2),int(eo(p)*820),255,-1,cv2.LINE_AA)
        m=cv2.GaussianBlur(m,(0,0),3).astype(np.float32)[:,:,None]/255
        out=(B*m+A*(1-m)).astype(np.uint8); cv2.circle(out,(W//2,H//2),int(eo(p)*820),CY,3,cv2.LINE_AA); return out
    if kind=='glitch':
        src=A if p<0.5 else B; out=src.copy(); rr=np.random.RandomState(int(p*40))
        for _ in range(9):
            y=rr.randint(0,H-40); h=rr.randint(8,50); out[y:y+h]=np.roll(src[y:y+h],rr.randint(-120,120),axis=1)
        return shift_rgb(out,int(18*math.sin(p*3.14159)))
    if kind=='flash':
        f=1-abs(p*2-1); base=A if p<0.5 else B
        return np.clip(base.astype(np.float32)*(1-f)+255*f,0,255).astype(np.uint8)
    return B
TRK=['fade']*21
TKIND={}
for i,s in enumerate(S):
    TKIND[i]='fade'
TD=0.45
def raw(i,lt):
    s=S[i]; img=np.zeros((H,W,3),np.uint8)
    SC[s['tag']](img,lt,s['d'],s['C'])
    return cam(img,s['tag'],lt,s['d'])
def render(t,subs=False):
    i=scene_at(t); s=S[i]; lt=t-s['start']
    img=raw(i,lt)
    if i>0 and lt<TD:
        A=raw(i-1,S[i-1]['d']+lt); img=trans(A,img,lt/TD,TKIND[i])
    img=bloom(img)
    draw_chapter(img,t)
    if t<0.5: img=(img*ease(t/0.5)).astype(np.uint8)
    if t>TOTAL-1.2 and False: pass
    return img
if __name__=='__main__':
    mode=sys.argv[1]
    if mode=='plan':
        for s in S: print(s['act'],s['tag'],round(s['start'],2),round(s['end'],2),[ (round(a,1),round(b,1)) for a,b in s['C']])
        print('TOTAL',TOTAL)
    if mode=='keys':
        import os; os.makedirs('keys',exist_ok=True)
        for j,s in enumerate(S):
            lt=min(s['d']-0.3,max(1.2,s['d']*0.75)); img=raw(j,lt)
            cv2.imwrite('keys/%02d_%s.png'%(j+1,s['tag']),img)
    if mode=='test':
        ts=[float(x) for x in sys.argv[2:]]
        for x in ts: cv2.imwrite('test_%05.1f.png'%x,render(x))
