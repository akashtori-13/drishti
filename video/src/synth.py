import os, numpy as np, scipy.signal as sg, scipy.io.wavfile as wf, math, render
NOVOICE=os.environ.get('NOVOICE','0')=='1'  # 1 = music+SFX only, no voice-over, no ducking
sr=48000
TOT=render.TOTAL; N=int(TOT*sr)+sr
S=render.S; C=lambda i,j: S[i]['C'][j]
rng=np.random.RandomState(11)
def T(d): return np.arange(int(d*sr))/sr
def mf(m): return 440*2**((m-69)/12)
def lp(x,fc,o=2): return sg.sosfilt(sg.butter(o,min(fc,sr*0.45),'low',fs=sr,output='sos'),x)
def hp(x,fc,o=2): return sg.sosfilt(sg.butter(o,fc,'high',fs=sr,output='sos'),x)
def bp(x,a,b,o=2): return sg.sosfilt(sg.butter(o,[a,min(b,sr*0.45)],'band',fs=sr,output='sos'),x)
def ed(n,dec): return np.exp(-np.arange(n)/sr*dec)
def swell(n,a,r):
    e=np.ones(n); na=int(a*sr); nr=int(r*sr)
    e[:na]=np.linspace(0,1,na)**1.5 if na>0 else 1; e[-nr:]=np.linspace(1,0,nr)**1.5 if nr>0 else 1; return e
# ----- SFX bus (stereo) -----
SL=np.zeros(N,np.float32); SR=np.zeros(N,np.float32)
def put(t,x,g=1.0,pan=0.0):
    i=int(max(t,0)*sr)
    if i>=N: return
    x=x[:N-i]; l=g*math.cos((pan+1)*0.25*math.pi); r=g*math.sin((pan+1)*0.25*math.pi)
    SL[i:i+len(x)]+=x*l*1.414; SR[i:i+len(x)]+=x*r*1.414
def tone(f,d,dec=8,harm=(1,),fm=0):
    t=T(d); y=sum((0.5**k)*np.sin(2*np.pi*f*h*t+fm*np.sin(2*np.pi*5*t)) for k,h in enumerate(harm)); return y*ed(len(t),dec)*np.minimum(1,t*400)
def bell(f,d=1.8,g=1):
    t=T(d); y=0
    for a,h,dc in ((1,1,2.2),(0.5,2.76,3.0),(0.3,5.4,4.5),(0.25,1.5,2.6)): y=y+a*np.sin(2*np.pi*f*h*t)*np.exp(-t*dc)
    return y*np.minimum(1,t*500)*g
def pop(f=520,d=0.16):
    t=T(d); fr=f*(1+1.6*np.exp(-t*40)); return np.sin(2*np.pi*np.cumsum(fr)/sr)*ed(len(t),22)*np.minimum(1,t*600)
def tick(f=2600,d=0.04):
    t=T(d); n=rng.randn(len(t)); return (bp(n,1500,6000)*0.6+np.sin(2*np.pi*f*t)*0.4)*ed(len(t),110)
def blip(f=880,d=0.09):
    t=T(d); return np.sign(np.sin(2*np.pi*f*t))*0.25*ed(len(t),30)+np.sin(2*np.pi*f*t)*0.3*ed(len(t),30)
def sweep_noise(d,f0,f1,q=0.8,shape='tri',pk=0.5):
    n=int(d*sr); x=rng.randn(n); out=np.zeros(n); B=1024; zi=None
    for b in range(0,n,B):
        p=b/n; fc=f0*(f1/f0)**p; lo=max(60,fc*0.6); hi=min(fc*1.7,sr*0.45)
        sos=sg.butter(2,[lo,hi],'band',fs=sr,output='sos')
        if zi is None: zi=np.zeros((sos.shape[0],2))
        seg_,zi=sg.sosfilt(sos,x[b:b+B],zi=zi); out[b:b+B]=seg_
    p=np.arange(n)/n
    env=(np.minimum(1,p/pk)*np.minimum(1,(1-p)/(1-pk)) if shape=='tri' else (p**2 if shape=='up' else (1-p)**1.5))
    return out*env*3
def whoosh(d=0.6,up=True): return sweep_noise(d,300,5000,shape='tri') if up else sweep_noise(d,5000,300,shape='tri')
def riser(d,g=1):
    n=int(d*sr); t=T(d); p=t/d
    ch=np.sin(2*np.pi*np.cumsum(150*(1+7*p**2))/sr)*0.18*p**2
    return (sweep_noise(d,250,9000,shape='up')*0.9+ch)*g
def impact(g=1.0,d=2.6):
    t=T(d); sub=np.sin(2*np.pi*np.cumsum(70*np.exp(-t*1.1)+32)/sr)*np.exp(-t*1.3)
    n=lp(rng.randn(len(t)),2400)*np.exp(-t*5)*0.6; crack=hp(rng.randn(len(t)),2500)*np.exp(-t*30)*0.5
    return (sub*1.1+n+crack)*g*np.minimum(1,t*800)
def shimmer(d=1.5,f=1200):
    t=T(d); y=sum(np.sin(2*np.pi*f*h*t+k)*np.exp(-t*(1.2+k*0.3)) for k,h in enumerate((1,1.5,2,2.52,3.0))); return y*0.25
def thud(f=70,d=0.5):
    t=T(d); return np.sin(2*np.pi*np.cumsum(f*(1+2*np.exp(-t*30)))/sr)*ed(len(t),9)
def buzz(f=110,d=0.3):
    t=T(d); return (np.sign(np.sin(2*np.pi*f*t))*0.3+np.sin(2*np.pi*f*t*1.5)*0.2)*ed(len(t),6)
def hoot(d=0.5):
    t=T(d); f=420*np.exp(-t*0.8)+60; y=np.sin(2*np.pi*np.cumsum(f)/sr)+0.3*np.sin(4*np.pi*np.cumsum(f)/sr)
    return y*np.sin(np.pi*np.minimum(1,t/d))**1.5*0.5
PENT=[62,65,67,69,72,74,77,79,81,84]
def at(i,off): return S[i]['start']+off
# transitions
for i in range(1,len(S)):
    k=render.TKIND[i]; st=S[i]['start']
    if k=='flash': put(st-0.1,impact(0.5,1.5),0.7)
    elif k=='glitch': 
        n=hp(rng.randn(int(0.4*sr)),1200)*np.minimum(1,np.arange(int(0.4*sr))/sr*30)
        n*=(np.sin(np.arange(len(n))/sr*2*np.pi*28)>0)*1.0; put(st-0.05,n*0.3,0.8)
    elif k=='iris': put(st-0.1,sweep_noise(0.55,400,6000,shape='up')*0.7,0.55)
    elif k=='zoom': put(st-0.1,whoosh(0.6,True)*0.9,0.6)
    elif k in('push_l','push_up'): put(st-0.12,whoosh(0.55,True),0.7,-0.6)
    elif k=='push_r': put(st-0.12,whoosh(0.55,True),0.7,0.6)
    else: put(st-0.2,whoosh(0.7,True)*0.5,0.45)
# 0 plates
for j in range(int((S[0]['d']-1.4)/0.4545)): put(1.4+j*0.4545,tick(2200+60*(j%2)*10),0.28,0.2*(1 if j%2 else -1))
tp=C(0,3)[0]+0.9; put(tp,bell(1568,2.5),0.5); put(tp,shimmer(2.2,1800),0.5); put(C(0,2)[0]-0.1,pop(440),0.35)
# 1 sphx
put(at(1,0.3),whoosh(1.1),0.45,0.4)
for j in range(22): put(at(1,0.0+j*0.08*(1+j/40)),tick(1800+40*j),0.15)
put(at(1,C(1,0)[0]+0.3),sweep_noise(C(1,0)[1]-C(1,0)[0]-0.6,500,7000,shape='tri',pk=0.8)*0.5,0.5)
t0=at(1,C(1,1)[0])
for j in range(26): put(t0+j*0.075,tick(1500+40*j),0.15)
put(t0+2.05,bell(988,1.5),0.35)
for j in range(34): put(t0+0.6+j*0.065,tick(1000+60*j,0.03),0.1,-0.3+0.02*j)
put(at(1,C(1,2)[0]-0.1),impact(0.45,1.6),0.6); put(at(1,C(1,2)[0]+0.2),pop(660),0.4); put(at(1,C(1,2)[0]+0.5),bell(1318),0.3)
# 2 waste
for j in range(14): put(at(2,0.2+j*0.09),pop(380+j*30),0.18,-0.8+j*0.12)
tf=at(2,C(2,1)[0]); 
for j in range(6): put(tf+j*0.4,thud(90,0.3),0.3)
put(tf,whoosh(1.4,False),0.5); put(tf+1.0,bell(196,1.8),0.5); put(tf+1.0,thud(60,1.0),0.7)
# 3 team (restored first cut: room dots 0.3+i*0.12, badges 10.45+i*0.08,
# dim 11.3, logo build from 11.9)
put(at(3,0.1),pop(330),0.4)
for i in range(6): put(at(3,0.3+i*0.12),pop(400+i*60),0.25,-0.7+i*0.28)
for i in range(6): put(at(3,0.3+i*0.12+0.02),bell(784*2**(i/6),0.8),0.12)
put(at(3,0.5),shimmer(2.0,1800),0.4)
for i in range(6): put(at(3,10.45+i*0.08),pop(420+i*55),0.3,-0.7+i*0.28)
put(at(3,11.3),impact(0.6,2),0.65); put(at(3,11.3),whoosh(0.7),0.4)
put(at(3,11.7),riser(1.2),0.55); put(at(3,12.05),pop(260),0.4); put(at(3,12.35),whoosh(0.5),0.4); put(at(3,12.6),impact(1.0,3.0),0.9); put(at(3,12.6),shimmer(2.5,1500),0.6)
# 4 throw
for i in range(8): put(at(4,0.2+i*0.08),pop(360+i*25),0.2,-0.7+i*0.2)
for i in range(1,7): put(at(4,C(4,0)[0]+1.0+i*0.28),blip(180,0.1)*0.8,0.3)
put(at(4,C(4,1)[0]+0.4),sweep_noise(2.8,3000,300,shape='tri')*0.5,0.4); put(at(4,C(4,1)[0]+1.6),pop(440),0.4)
put(at(4,C(4,2)[0]),whoosh(1.2,False),0.55); put(at(4,C(4,2)[0]+0.9),thud(55,1.1),0.8); put(at(4,C(4,2)[0]+0.9),bell(150,1.5),0.3)
# 5 n466
L=C(5,0)[1]-C(5,0)[0]; s0=at(5,0)
for j in range(34): put(s0+0.28*L+j*0.04,tick(1200+j*45),0.2)
put(s0+0.28*L+1.35,bell(1046,1.2),0.5); put(s0+0.28*L+1.35,pop(700),0.3)
put(s0+0.52*L,thud(60,1.0),0.9); put(s0+0.52*L,buzz(90,0.5),0.3)
put(s0+0.82*L,impact(0.7,2.2),0.8); put(s0+0.82*L,buzz(70,1.2),0.35)
# 6 owl
put(at(6,0.4),hoot(0.55),0.4,-0.5)
for i in range(4): put(at(6,0.2+i*0.3),pop(300+i*40),0.15,0.2+i*0.15)
t1=at(6,C(6,1)[0]); put(t1+0.3,sweep_noise(1.2,500,6000,shape='up')*0.5,0.4); put(t1+1.5,bell(1174,2.0),0.5); put(t1+1.6,shimmer(2,1700),0.4)
for j in range(40): put(t1+1.6+j*0.045,tone(500*2**(j/22),0.12,18)*0.5,0.18)
put(t1+3.4,bell(1568,2.2),0.4); put(t1+5.3,hoot(0.5),0.35,-0.5)
# 7 reveal  (riser lead-in under end of owl)
r0=at(7,0)
put(r0-3.4,riser(3.5),0.7); put(r0-0.05,whoosh(0.4),0.5); put(r0+0.1,impact(1.3,3.8),1.0); put(r0+0.1,shimmer(3.0,1400),0.5)
put(r0+1.55,bell(1318,2.5),0.5); put(r0+1.55,pop(300),0.4)
# 8 product
put(at(8,0.1),whoosh(0.5),0.45); put(at(8,0.6),pop(480),0.35); put(at(8,1.1),tick(900,0.07),0.6)
for j in range(int((S[8]['d']-1.0)/0.4167)): put(at(8,1.0+j*0.4167),tick(2400),0.3,0.3*((-1)**j))
put(at(8,C(8,1)[0]-0.3),blip(1320,0.06),0.4); put(at(8,C(8,1)[0]-0.3),pop(900),0.3)
put(at(8,C(8,1)[0]+1.8),buzz(120,0.35),0.3); put(at(8,C(8,1)[0]+2.0),thud(80,0.4),0.5)
# 9 roll
put(at(9,C(9,0)[0]),pop(300),0.45); put(at(9,C(9,0)[0]),shimmer(1.4,1300),0.35)
CALL="IRSA, Gaia, SIMBAD, Horizons, SkyBoT, Minor Planet Center, CelesTrak, 2MASS —"
c1=C(9,1)
for i,nm in enumerate(["IRSA","Gaia","SIMBAD","Horizons","SkyBoT","Minor Planet Center","CelesTrak","2MASS"]):
    tt=c1[0]+(c1[1]-c1[0])*CALL.index(nm)/len(CALL)*0.95
    put(at(9,tt),pop(560),0.3,-0.7+i*0.2); put(at(9,tt),bell(mf(PENT[i%8]+12),0.9),0.15,-0.7+i*0.2); put(at(9,tt),tick(3000),0.2)
c2=C(9,2)
for i in range(8): put(at(9,c2[0]+(c2[1]-c2[0])*(i/9+0.07)),bell(mf(PENT[i]+12),1.0),0.2,-0.6+i*0.17)
# 10 comet
for i in range(5): put(at(10,0.2+i*0.12),pop(420+i*40),0.2,-0.6+i*0.3)
c1=at(10,C(10,1)[0])
for j in range(40): put(c1+j*0.04,tick(1300+j*30),0.18)
put(c1+1.65,bell(1318,1.5),0.5); put(c1+1.65,impact(0.4,1.4),0.5); put(c1+0.5,whoosh(0.9),0.3,0.5)
put(at(10,C(10,2)[0]),buzz(100,0.8),0.35); put(at(10,C(10,2)[0]),thud(55,0.8),0.5)
c3=at(10,C(10,3)[0])
for i in range(5): put(c3+0.2+i*0.35,bell(mf(PENT[i*1+1]+12),1.0),0.3,-0.6+i*0.3); put(c3+0.2+i*0.35,pop(600),0.25)
put(c3,whoosh(1.9,True),0.3,0.3)
# 11 keep
for i in range(5): put(at(11,0.1+i*0.1),pop(380+i*35),0.2)
t0=at(11,C(11,0)[0]+1.2)
put(t0,bell(880,1),0.35); put(t0+0.2,buzz(120,0.3),0.3); put(t0+0.25,thud(70,0.5),0.4)
t1=at(11,C(11,1)[0])
for i in range(5): put(t1+0.15+i*0.18,bell(mf(PENT[i]+12),1.2),0.35,-0.6+i*0.3)
put(t1+0.2,shimmer(2.0,1400),0.45); put(t1+0.2,thud(65,0.7),0.5)
# 12 pixel
for i in range(5): put(at(12,0.3+i*0.2),pop(430+i*30),0.18)
sp=at(12,C(12,1)[0]+0.6)
for j in range(3): put(sp+j*0.18,blip(1400,0.1),0.4)
put(at(12,C(12,2)[0]-0.2),whoosh(0.6),0.4); put(at(12,C(12,2)[0]+0.4),buzz(95,0.5),0.3)
fx=at(12,C(12,3)[0]+0.4); put(fx,bell(784,1.2),0.4); put(fx+0.15,bell(1175,1.8),0.45); put(fx+0.2,shimmer(1.6,1800),0.35)
# 13 name
put(at(13,0.0),shimmer(2.0,900),0.4); put(at(13,0.0),pop(300),0.3)
c0=C(13,0)[0]
put(at(13,c0+1.1),riser(1.5),0.4); put(at(13,c0+2.3),impact(0.8,2.5),0.7); put(at(13,c0+2.3),shimmer(2.5,1600),0.4); put(at(13,C(13,1)[0]),pop(520),0.4)
# 14 dcurve
put(at(14,0.1),pop(380),0.3)
put(at(14,C(14,1)[0]),whoosh(0.5),0.4); put(at(14,C(14,1)[0]),pop(440),0.35)
for i in range(9): put(at(14,C(14,2)[0]+0.1+i*0.22),bell(mf(PENT[i%8]),0.9),0.22,-0.6+i*0.15)
c3=at(14,C(14,3)[0]); put(c3+0.1,sweep_noise(1.5,600,5000,shape='up')*0.5,0.35)
for j in range(28): put(c3+0.1+j*0.055,tone(380*2**(j/16),0.1,20),0.15)
put(c3+1.8,thud(60,1.0),0.5); put(c3+1.8,buzz(220,0.6),0.2)
# 15 dpairs
put(at(15,0.4),pop(400),0.3,-0.6); put(at(15,0.7),pop(520),0.3,0.6)
put(at(15,C(15,1)[0]),pop(480),0.35); put(at(15,C(15,2)[0]),thud(55,1.2),0.6); put(at(15,C(15,2)[0]),bell(233,2.0),0.3); put(at(15,C(15,3)[0]),pop(620),0.35)
# 16 access
sc="A student in Bandarban, a teacher in Nairobi, an amateur in Chandpur —"; c1=C(16,1)
for i,nm in enumerate(['Bandarban','Nairobi','Chandpur']):
    tt=c1[0]+(c1[1]-c1[0])*(sc.index(nm))/76
    put(at(16,tt),bell(mf(PENT[i*2+2]),1.8),0.4,-0.5+i*0.5); put(at(16,tt),pop(500),0.3,-0.5+i*0.5)
c3=C(16,3)
for i in range(3): put(at(16,c3[0]+(c3[1]-c3[0])*(i/3.1)),thud(75,0.5),0.5); put(at(16,c3[0]+(c3[1]-c3[0])*(i/3.1)),tick(1800),0.4)
# 17 nums
for fr in (0.0,0.34,0.68):
    tt=at(17,C(17,0)[0]+(C(17,0)[1]-C(17,0)[0])*fr*0.95); put(tt,impact(0.4,1.2),0.6); put(tt+0.02,pop(520+fr*400),0.4)
put(at(17,C(17,1)[0]),whoosh(2.5,True),0.35,-0.4)
put(at(17,C(17,1)[0]+2.5),buzz(100,0.7),0.35); put(at(17,C(17,1)[0]+2.55),thud(60,0.6),0.5)
# 18 ice
put(at(18,0.0),impact(0.7,2.5),0.7); put(at(18,0.3),pop(300),0.3)
c1=at(18,C(18,1)[0]); put(c1+1.0,bell(mf(76),1.8),0.4,-0.3); put(c1+2.0,bell(mf(81),1.8),0.4,0.3)
put(at(18,C(18,2)[0]),thud(55,1.0),0.5); put(at(18,C(18,2)[0]),bell(262,1.8),0.25)
c3=at(18,C(18,3)[0]); put(c3,whoosh(0.7),0.45)
for i in range(6): put(c3+0.2+i*0.12,bell(mf(PENT[i]+12),0.9),0.2,-0.7+i*0.28)
c4=at(18,C(18,4)[0]); put(c4,shimmer(2.5,800),0.5); put(c4+0.1,riser(1.3),0.35)
put(c4+1.4,bell(1046,2.0),0.5); put(c4+1.45,bell(1318,2.2),0.45); put(c4+1.5,bell(1568,2.4),0.45); put(c4+1.4,impact(0.5,2),0.6)
# 19 finding
put(at(19,0),pop(330),0.5); put(at(19,0.1),pop(660),0.3); put(at(19,0.6),pop(440),0.5); put(at(19,1.2),whoosh(0.5),0.5); put(at(19,1.4),thud(80,0.4),0.5)
# 20 final
f0=at(20,C(20,1)[0]); put(f0-0.2,impact(0.8,3.5),0.9)
for i in range(1,13): put(f0+i*1.0-0.1,sweep_noise(0.7,600,6000,shape='tri')*0.5,0.3,(-1)**i*0.5); put(f0+i*1.0,shimmer(1.2,900+60*i),0.18)
put(at(20,C(20,2)[0]),impact(0.7,3.0),0.7)
# ----- music -----
def pad(notes,d,fc,gain=1.0):
    t=T(d); y=np.zeros(len(t))
    for m in notes:
        f=mf(m)
        for dt in (-0.004,0.0,0.004):
            ph=(f*(1+dt)*t)%1; y+=(2*ph-1)
    y=lp(y/(len(notes)*3),fc)*gain
    return y
CH=[[38,45,50,53,57],[34,41,46,50,53],[31,43,50,55,58],[33,40,45,49,52]]  # Dm Bb Gm A
CHR=[38,34,31,33]
def keyp(pts,t): 
    xs=[p[0] for p in pts]; ys=[p[1] for p in pts]; return np.interp(t,xs,ys)
INT=[(0,0.30),(20,0.45),(35,0.55),(47,0.45),(61,0.6),(70,0.6),(74.5,0.95),(77,1.0),(80,0.8),(88,0.75),(123,0.85),(143,0.7),(148,0.85),(177,0.6),(194,0.75),(204,0.65),(223,0.55),(227,0.55),(233,0.95),(236.5,1.0),(239.9,0.5)]
M=np.zeros(N)
chord_len=8.0; k=0; t=0.0
while t<TOT+1:
    ch=CH[k%4]; d=chord_len+3.0
    inten=float(keyp(INT,t+4))
    y=pad(ch,d,500+2200*inten,1.0)*swell(int(d*sr),2.4,2.6)*(0.25+0.75*inten)
    # sub
    ts=T(d); y+=np.sin(2*np.pi*mf(CHR[k%4]-12)*ts)*0.55*swell(len(ts),1.5,2.0)*(0.4+0.6*inten)
    # high airy layer for later
    if t>60:
        y+=pad([c+24 for c in ch[1:4]],d,3000,0.5)*swell(len(ts),3.0,3.0)*0.35*inten
    i=int(t*sr); M[i:i+len(y)]+=y[:N-i]
    t+=chord_len; k+=1
# plucks
def pluck(m,d=2.2):
    f=mf(m); t_=T(d); return (np.sin(2*np.pi*f*t_)+0.4*np.sin(4*np.pi*f*t_)+0.15*np.sin(6*np.pi*f*t_))*np.exp(-t_*2.8)*np.minimum(1,t_*300)
tt=2.0
while tt<46:
    p=pluck(PENT[rng.randint(0,6)]); i=int(tt*sr); M[i:i+len(p)]+=p*0.10; tt+=rng.choice([1.1,1.6,2.2,2.8])
# heartbeat tension Act II
bt=48.0; 
while bt<76.8:
    prog=(bt-48)/29; th=thud(52,0.5); put_i=int(bt*sr); M[put_i:put_i+len(th)]+=th*(0.25+0.5*prog)
    th2=thud(48,0.4); j=int((bt+0.28)*sr); M[j:j+len(th2)]+=th2*(0.18+0.35*prog)
    bt+=1.25-0.5*prog
# rhythm: arp + kick/hats
BPM=110; beat=60/BPM
def arp_block(t0,t1,step,g,oct_=12):
    t=t0; n=0
    while t<t1:
        ch=CH[int((t//8))%4]; note=ch[1+(n%4)]+oct_+(12 if n%8>=4 else 0)
        p=pluck(note,1.2)*g; i=int(t*sr); M[i:i+len(p)]+=p[:N-i]; t+=step; n+=1
arp_block(52,76,beat,0.07); arp_block(80.14,177.1,beat/2,0.075); arp_block(177.19,224,beat,0.07,0)
def kick(): t=T(0.45); return np.sin(2*np.pi*np.cumsum(46+90*np.exp(-t*28))/sr)*ed(len(t),9)
def hat(): n=hp(rng.randn(int(0.06*sr)),7000); return n*ed(len(n),60)
def clap(): n=bp(rng.randn(int(0.25*sr)),1200,5000); return n*ed(len(n),22)*0.7
K=kick(); Hh=hat(); Cl=clap()
for (a,b) in ((80.14,143.18),(147.73,177.19),(193.64,203.6)):
    t=a; n=0
    while t<b:
        i=int(t*sr); M[i:i+len(K)]+=K*0.55
        j=int((t+beat/2)*sr); M[j:j+len(Hh)]+=Hh*0.18
        if n%2==1 and a<190: M[i:i+len(Cl)]+=Cl*0.22
        t+=beat; n+=1
# final swell (strings/brass)
f1=226.7; dd=TOT-f1+1; ts=T(dd); sw=pad([38,50,57,62,65,69,74],dd,4500,1.2)*(np.linspace(0.1,1,len(ts))**1.7)
sw+=np.sin(2*np.pi*mf(26)*ts)*0.8*np.linspace(0.2,1,len(ts))
i=int(f1*sr); M[i:i+len(sw)]+=sw[:N-i]*0.9
M*=np.minimum(1,(TOT-np.arange(N)/sr)/1.2).clip(0,1)
M/=np.max(np.abs(M))+1e-9
# ----- reverb -----
def ir(seed,d=2.0):
    r=np.random.RandomState(seed); n=int(d*sr); x=r.randn(n)*np.exp(-np.arange(n)/sr*2.6); x=lp(x,5500); x[0:int(0.02*sr)]*=0.1; return (x/np.sqrt(np.sum(x**2))).astype(np.float32)
IL,IR=ir(1),ir(2)
ML=sg.oaconvolve(M.astype(np.float32),IL)[:N]; MR=sg.oaconvolve(M.astype(np.float32),IR)[:N]
mdry=M.astype(np.float32)
mL=0.45*mdry+0.8*ML; mR=0.45*mdry+0.8*MR
sL=SL+0.3*sg.oaconvolve(SL,IL)[:N]; sR=SR+0.3*sg.oaconvolve(SR,IR)[:N]
# ----- voice + ducking -----
sr_v,vo=wf.read('vo2.wav'); vo=vo.astype(np.float32)/32768
V=np.zeros(N,np.float32); V[:len(vo)]=vo[:N]
rms=np.sqrt(np.maximum(sg.oaconvolve(V**2,np.ones(int(0.12*sr))/int(0.12*sr))[:N],0))
env=np.clip(rms/(np.percentile(rms[rms>1e-4],85)),0,1)
env=sg.lfilter([1-math.exp(-1/(0.06*sr))],[1,-math.exp(-1/(0.06*sr))],env)
env=np.maximum(env,np.concatenate([np.zeros(int(0.5*sr)),env[:-int(0.5*sr)]])*0.0)
rel=np.zeros(N); a=math.exp(-1/(0.5*sr)); acc=0.0
rel=sg.lfilter([1-a],[1,-a],np.maximum.accumulate(np.zeros(N))+env) if False else env
duckm=1-0.62*np.clip(rel*1.4,0,1); ducks=1-0.35*np.clip(rel*1.4,0,1)
if NOVOICE: duckm=np.ones(N); ducks=np.ones(N)
vol=V/ (np.sqrt(np.mean(V[rms>0.02]**2))+1e-9)*0.12
if NOVOICE: vol=vol*0.0
outL=vol*1.0+mL*duckm*0.34+sL*ducks*0.38
outR=vol*1.0+mR*duckm*0.34+sR*ducks*0.38
nT=int(TOT*sr)
out=np.stack([outL[:nT],outR[:nT]],1)
out*=np.minimum(1,(TOT-np.arange(nT)/sr)/0.15)[:,None]
pk=np.max(np.abs(out)); print('peak',pk); out=out/max(pk,1e-9)*0.9
wf.write(('mix_novoice.wav' if NOVOICE else 'mix.wav'),sr,(out*32767).astype(np.int16)); print('mix done',nT/sr)
