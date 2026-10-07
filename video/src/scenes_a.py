from parts import *
from logo import logo
R=random.Random(3)
PLATE_STARS=[(R.random(),R.random(),R.random()*2.2+0.8) for _ in range(110)]
PL_A=(0.62,0.38); PL_B=(0.69,0.44)
ALLSKY=[(R.uniform(-1,1),R.uniform(-1,1)) for _ in range(5000)]
ALLSKY=[(x,y) for x,y in ALLSKY if x*x+y*y<=1]
TEAM=[('Mahdin',CY),('Aazmaine',AM),('Saikat',MG),('Orni',GR),('Himel',VI),('Zubayer',BL)]
CAP_AMBER=AM; CAP_CREAM=RGB(232,228,216); CAP_PERI=RGB(111,127,191); CAP_BG=RGB(20,24,48)
def plate_caption(img,cx,y,plate,date,op=1.0,dy=0.0):
    """Specimen-label pill for the plate caption. Single line, tracked plate
    name (semi-bold→Bold) + amber dot + cream date. Centered on plate axis."""
    if op<=0.01: return
    ls=0.15; size=28
    w_plate=sum(textw(ch,'b',size)+(ls*size if ch!=' ' else ls*size*0.5) for ch in plate)-ls*size
    w_date=textw(date,'r',28)
    dot_r=3; gap=16
    pill_w=w_plate+gap*2+dot_r*2+w_date+44; pill_h=size+20
    cy=y+dy
    rrect(img,cx-pill_w/2,cy-pill_h/2,pill_w,pill_h,999,CAP_BG,-1,0.85*op)
    rrect(img,cx-pill_w/2,cy-pill_h/2,pill_w,pill_h,999,CAP_PERI,2,op)
    x=cx-(w_plate+gap*2+dot_r*2+w_date)/2
    for ch in plate:
        text(img,ch,x,cy,'b',size,CAP_AMBER,anchor='l',op=op)
        x+=textw(ch,'b',size)+(ls*size if ch!=' ' else ls*size*0.5)
    circ(img,(x+gap+dot_r,cy),dot_r,CAP_AMBER,-1,op)
    text(img,date,x+gap*2+dot_r*2,cy,'r',28,CAP_CREAM,anchor='l',op=op*0.85)
# Real member photos + full names + roles (video/"Grp pic"). Loaded once.
TEAM_MEMBERS=[
 ('Md Mahdin Al Abrar','Content Producer','Grp pic/MdMahdinAlAbrar_ContentProducer.jpeg'),
 ('Aazmaine Alif Abrar','Research Strategist','Grp pic/AazmaineAlifAbrar_ResearchStrategist.jpeg'),
 ('Md Hedayet Ullah (Saikat)','Scientific Researcher','Grp pic/MdHedayetUllah(Saikat)_ScientificResearcher.png'),
 ('Suraiya Ratry Orni','Physics Analyst','Grp pic/SuraiyaRatryOrni_PhysicsAnalyst.jpg'),
 ('Himel Das','Team Leader','Grp pic/HimelDas_TeamLeader.jpeg'),
 ('Zubayer Hasan Shaad','Scientific Systems Architect','Grp pic/ZubayerHasanShaad_ScientificSystemsArchitect.jpg'),
]
def _load_team_photos(size=150, radius=30):
    from PIL import Image as PImage
    outs = []
    for _, _, rel in TEAM_MEMBERS:
        try:
            im = PImage.open(rel).convert('RGB')
            w, h = im.size
            s = min(w, h)
            # faces sit in the upper part: bias the square crop upward
            y0 = max(0, min(h - s, int(h * 0.12)))
            x0 = (w - s) // 2
            im = im.crop((x0, y0, x0 + s, y0 + s)).resize((size, size))
            import numpy as np
            arr = np.asarray(im)[:, :, ::-1].copy()
            yy, xx = np.ogrid[:size, :size]
            cx = np.clip(xx, radius, size - 1 - radius)
            cy = np.clip(yy, radius, size - 1 - radius)
            dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
            alpha = np.ones((size, size))
            corner = dist > radius
            alpha[corner] = np.clip((radius - dist[corner]) / 3.0 + 1.0, 0, 1)
            outs.append((arr, alpha))
        except Exception:
            outs.append(None)
    return outs
TEAM_PHOTOS=_load_team_photos()
def _rring(img, x0, y0, size, radius, col, th, op):
    import cv2
    cv2.rectangle(img, (x0, y0 + radius), (x0 + size, y0 + size - radius), col, th)
    cv2.rectangle(img, (x0 + radius, y0), (x0 + size - radius, y0 + size), col, th)
    for cx_, cy_ in ((x0 + radius, y0 + radius), (x0 + size - radius, y0 + radius),
                     (x0 + radius, y0 + size - radius), (x0 + size - radius, y0 + size - radius)):
        cv2.circle(img, (cx_, cy_), radius, col, th)
    _ = op
def team_photo(img, slot, centre, size, ring_col, op=1.0):
    """Paste member photo (rounded square, face-biased crop) with rounded-square ring."""
    import numpy as np
    import cv2
    x, y = int(centre[0]), int(centre[1])
    x0, y0 = x - size // 2, y - size // 2
    H, W = img.shape[:2]
    # ring drawn on a scratch layer so `op` fades it cleanly
    layer = np.zeros_like(img)
    _rring(layer, x0 - 4, y0 - 4, size + 8, 30, tuple(int(v) for v in ring_col), 5, op)
    m = (layer.sum(axis=2, keepdims=True) > 0).astype(np.float32) * op
    img[:] = (img.astype(np.float32) * (1 - m) + layer.astype(np.float32) * m).astype(img.dtype)
    if slot is None or slot >= len(TEAM_PHOTOS) or TEAM_PHOTOS[slot] is None:
        return
    arr, alpha = TEAM_PHOTOS[slot]
    if arr.shape[0] != size:
        arr = cv2.resize(arr, (size, size))
        alpha = cv2.resize(alpha, (size, size))
    ov = np.zeros((H, W), np.uint8)
    cv2.rectangle(ov, (x0, y0 + 30), (x0 + size, y0 + size - 30), 255, -1)
    cv2.rectangle(ov, (x0 + 30, y0), (x0 + size - 30, y0 + size), 255, -1)
    for cx_, cy_ in ((x0 + 30, y0 + 30), (x0 + size - 30, y0 + 30),
                     (x0 + 30, y0 + size - 30), (x0 + size - 30, y0 + size - 30)):
        cv2.circle(ov, (cx_, cy_), 30, 255, -1)
    xa, xb = max(0, x0), min(W, x0 + size)
    ya, yb = max(0, y0), min(H, y0 + size)
    if xa >= xb or ya >= yb:
        return
    keep = (ov[ya:yb, xa:xb] > 0)[..., None].astype(np.float32)
    a = (alpha[ya-y0:yb-y0, xa-x0:xb-x0] * keep[..., 0] * op)[..., None]
    img[ya:yb, xa:xb] = (img[ya:yb, xa:xb] * (1 - a) + arr[ya-y0:yb-y0, xa-x0:xb-x0] * a).astype(img.dtype)
def bg(img,t,k=0): img[:]=BG0; starfield(img,t,0.6)
def sc_plates(img,t,d,C):
    bg(img,t)
    # year title
    a=eo(seg(t,0,0.9)); text(img,'1930',150-60*(1-a),90,'b',72,AM,'l',op=a)
    text(img,'ARIZONA',154-60*(1-a),145,'m',26,RGB(174,182,208),'l',op=a)
    # plate viewer (group shifted up 25px so the caption pill clears the frame)
    cx,cy,sz=700,347,400
    rrect(img,cx-sz/2-24,cy-sz/2-24,sz+48,sz+48,26,RGB(30,36,64),-1); rrect(img,cx-sz/2-24,cy-sz/2-24,sz+48,sz+48,26,RGB(110,125,175),3)
    slide=eo(seg(t,0.2,1.3))
    ph=int((t-1.4)*2.2)%2 if t>1.4 else 0
    x0=cx-sz/2; y0=cy-sz/2
    rrect(img,x0,y0,sz,sz,10,RGB(236,214,168))
    for (u,v,r) in PLATE_STARS:
        circ(img,(x0+u*sz,y0+v*sz),r,RGB(60,40,28))
    pa=(x0+PL_A[0]*sz,y0+PL_A[1]*sz); pb=(x0+PL_B[0]*sz,y0+PL_B[1]*sz)
    mv=pb if ph else pa
    circ(img,mv,4.5,RGB(40,22,16))
    # plate label: pill tag below the frame (frame bottom 571, pill center 603:
    # 32px gap, baseline ~85px above the 720p bottom edge)
    la=eo(seg(t,0.35,0.75)); dy=10*(1-la)
    cyc=(t-1.4)*2.2 if t>1.4 else 0.0
    f=(cyc%1)*0.4545
    cur=('PLATE B' if ph else 'PLATE A','Jan 29' if ph else 'Jan 23')
    if t>1.4 and f<0.3:
        w=f/0.3; prev=('PLATE A' if ph else 'PLATE B','Jan 23' if ph else 'Jan 29')
        plate_caption(img,cx,603,prev[0],prev[1],op=(1-w)*la,dy=dy)
        plate_caption(img,cx,603,cur[0],cur[1],op=w*la,dy=dy)
    else:
        plate_caption(img,cx,603,cur[0],cur[1],op=la,dy=dy)
    # night tally
    n=int(1+max(0,t-1.0)*3.4)
    text(img,'NIGHT %d'%n,1010+0,210,'b',34,WH,'l',op=a)
    for i in range(min(n,30)):
        gx=1010+(i%5)*30; gy=250+(i//5)*40
        line(img,(gx,gy),(gx,gy+28),AM,3)
        if i%5==4: pass
    if t<2.0: slide=slide
    # pluto reveal
    tp=C[3][0]+0.9
    if t>tp:
        k=seg(t,tp,tp+0.6)
        for j in range(3):
            rr=((t-tp)*60+j*30)%90
            circ(img,mv if False else pb,18+rr,GR,2,(1-rr/90)*k)
        circ(img,pb,16,GR,3,k); circ(img,pa,16,GR,3,k)
        line(img,pa,pb,GR,2,k)
        text(img,'PLUTO',pb[0]+78,pb[1]-34,'b',34,GR,op=k)
        line(img,(pb[0]+18,pb[1]-14),(pb[0]+40,pb[1]-26),GR,2,k)
    if t>C[2][0]-0.1:
        k=eo(seg(t,C[2][0]-0.1,C[2][0]+0.7))
        rrect(img,60,500-40*(1-k),330,84,16,RGB(20,26,52),-1,k); 
        text(img,'CLYDE TOMBAUGH',84,522-40*(1-k),'b',26,WH,'l',op=k); text(img,'age 24 · Lowell Observatory',84,554-40*(1-k),'r',20,GY,'l',op=k)
def sc_sphx(img,t,d,C):
    bg(img,t)
    # Earth
    circ(img,(640,1120),560,RGB(20,60,120)); circ(img,(640,1120),560,RGB(90,170,255),3); dglow(img,(640,560),300,RGB(60,120,200),0.18)
    # year ticker
    yk=eo(seg(t,0,1.8)); yr=int(lerp(1930,2026,yk))
    a=1-seg(t,C[0][0]+2.5,C[0][0]+3.3)*0
    text(img,str(yr),W-210,90,'b',64,AM,'c')
    text(img,'96 YEARS LATER',W-210,140,'m',20,GY)
    # orbit + satellite
    ang=-0.5+t*0.18; ox=640+700*math.cos(ang+3.14*1.0)*0.0
    sx=640+470*math.cos(-math.pi/2+t*0.25+0.9); sy=1120+560*1.0*math.sin(-math.pi/2+t*0.25+0.9)-120
    ell(img,(640,1120),(640,680),0,RGB(120,160,255),2,0.5,200,340)
    ka=eb(seg(t,0.3,1.4)); satellite(img,(sx,sy-30),44*ka)
    # all-sky ellipse
    pr=seg(t,C[0][0]+0.3,C[0][1]-0.3)
    ex,ey,rx,ry=640,215,290,125
    if pr>0:
        ell(img,(ex,ey),(rx,ry),0,mix(NAVY,CY,0.12),-1); 
        n=int(len(ALLSKY)*pr)
        for i in range(0,n,1):
            u,v=ALLSKY[i]; col=spec_col((u+1)/2); circ(img,(ex+u*rx,ey+v*ry),1.3,col)
        ell(img,(ex,ey),(rx,ry),0,CY,2,0.8)
        text(img,'FULL INFRARED SKY · EVERY 6 MONTHS',ex,ey+ry+30,'m',20,GY)
        # sweep line
        sw=ex-rx+2*rx*pr; line(img,(sw,ey-ry*0.9),(sw,ey+ry*0.9),WH,2,0.5)
    # billion + 102
    if t>C[1][0]:
        k=seg(t,C[1][0],C[1][0]+2.0); v=int(1e9*ease(k))
        text(img,'{:,}'.format(v),640,448,'b',56,WH,op=eo(seg(t,C[1][0],C[1][0]+0.4)))
        text(img,'objects',640,492,'m',22,GY,op=eo(seg(t,C[1][0],C[1][0]+0.4)))
        bx0,bx1,by=240,1040,570
        n=int(102*seg(t,C[1][0]+0.6,C[1][0]+2.8))
        for i in range(n): 
            xx=bx0+(bx1-bx0)*i/101; line(img,(xx,by-16),(xx,by+16),spec_col(i/101),5)
        if n>3:
            text(img,'102 wavelengths',(bx0+bx1)/2,by-38,'b',24,WH)
            # visible window
            rrect(img,bx0-6,by-24,46,48,6,WH,2); text(img,'eyes',bx0+17,by+44,'m',16,GY)
            text(img,'unseen by eyes →',bx0+300,by+44,'m',18,AM)
    # IRSA badge
    if t>C[2][0]:
        k=eo(seg(t,C[2][0]-0.1,C[2][0]+0.7))
        img[:]=cv2.addWeighted(img,1-0.78*k,np.full_like(img,NAVY),0.78*k,0)
        cx,cy=640,330
        rrect(img,cx-290,cy-120,580,240,26,RGB(18,26,60),-1,k); rrect(img,cx-290,cy-120,580,240,26,CY,3,k)
        text(img,'NASA / IPAC',cx,cy-62,'m',24,GY,op=k); text(img,'IRSA',cx,cy-4,'b',86,WH,op=k); text(img,'Infrared Science Archive',cx,cy+62,'r',24,GY,op=k)
        for i in range(10):
            ang2=t*0.6+i*0.628; circ(img,(cx+360*math.cos(ang2),cy+170*math.sin(ang2)),6,spec_col(i/10),-1,k)
        rrect(img,cx-90,cy+150,180,46,23,GR,-1,k); text(img,'ALL PUBLIC',cx,cy+173,'b',22,NAVY,op=k)
def sc_waste(img,t,d,C):
    bg(img,t)
    text(img,'EVERY VISIT SEES A DIFFERENT SLICE OF THE SPECTRUM',640,70,'b',26,GY,op=eo(seg(t,0,0.6)))
    rr=random.Random(5)
    cols=[spec_col(rr.random()) for _ in range(32)]
    tf=C[1][0]
    for i in range(32):
        r_,c_=divmod(i,8); x=130+c_*135; y=130+r_*118
        a=eb(seg(t,0.2+i*0.04,0.7+i*0.04))
        col=cols[i]; op=a
        ff=seg(t,tf+i*0.07,tf+i*0.07+0.9)
        if ff>0:
            y=y+ff*ff*520; x=x+(i%3-1)*30*ff; op=1-ff
            col=mix(col,GY,min(1,ff*2))
        tile(img,x,y,110,92,col,i,max(op,0))
        if t>C[0][0]+1.2 and ff==0 and i%8!=0:
            if cols[i]!=cols[(i//8)*8]: cross(img,(x+55,y+46),30,RD,0.9*eo(seg(t,C[0][0]+1.2+i*0.03,C[0][0]+1.6+i*0.03)))
    if t>tf-0.2:
        k=eo(seg(t,tf-0.2,tf+0.6)); bin_icon(img,(640,585),80,k,seg(t,tf,tf+1)*0.8)
        text(img,'THROWN AWAY',640,520+0,'b',60,RD,op=k*0.0)
        text(img,'THROWN AWAY',900,585,'b',48,RD,op=k)
def sc_team(img,t,d,C):
    bg(img,t)
    c0=C[0]; c1=C[1]; c2=C[2]; c3=C[3]
    if t<c2[0]:
        # photo grid from the start (screen+dots removed): badges stagger in
        # over the first seconds, then hold for the whole slide
        names=["I'm Mahdin","Aazmaine","Saikat","Orni","Himel","Zubayer"]
        for i,(nm,col) in enumerate(TEAM):
            cx=640+((i%3)-1)*400; cy=215+(i//3)*250
            tt=0.5+i*0.6
            a=eb(seg(t,tt-0.05,tt+0.45))
            if a<=0: continue
            a=min(a,1.0)
            team_photo(img,i,(cx,cy-40),128,col,op=a)
            text(img,TEAM_MEMBERS[i][0],cx,cy+55,'b',20,WH,op=a)
            text(img,TEAM_MEMBERS[i][1],cx,cy+82,'r',15,GY,op=a)
    elif t<c3[0]:
        txt=ACTSTEXT=c1[2] if len(c1)>2 else ''
        k=eo(seg(t,c1[0]-0.1,c1[0]+0.5))
        times=[c1[0]+0.7,c1[0]+1.55,c1[0]+2.0,c1[0]+2.45,c1[0]+2.9,c1[0]+3.4]
        # sync badges to words: given cue text proportion
        names=["I'm Mahdin","Aazmaine","Saikat","Orni","Himel","Zubayer"]
        for i,(nm,col) in enumerate(TEAM):
            cx=640+((i%3)-1)*400; cy=215+(i//3)*250
            if i==0: tt=c1[0]
            else:
                full="I'm Mahdin — with Aazmaine, Saikat, Orni, Himel and Zubayer."
                pos=full.index(nm) if nm in full else 0
                tt=c1[0]+(c1[1]-c1[0])*(pos/len(full))*0.97
            a=eb(seg(t,tt-0.05,tt+0.45))
            if a<=0: continue
            a=min(a,1.0)
            team_photo(img,i,(cx,cy-40),128,col,op=a)
            text(img,TEAM_MEMBERS[i][0],cx,cy+55,'b',20,WH,op=a)
            text(img,TEAM_MEMBERS[i][1],cx,cy+82,'r',15,GY,op=a)
        if t>c3[0]-0.6:
            kk=eo(seg(t,c3[0]-0.6,c3[0]+0.2)); img[:]=cv2.addWeighted(img,1-0.82*kk,np.full_like(img,NAVY),0.82*kk,0)
            text(img,'TEAM',640,250,'m',36,GY,op=kk); text(img,'AKASHTORI',640,340,'b',100,WH,op=kk)
            line(img,(380,410),(380+520*kk,410),AM,5)
    else:
        img[:]=NAVY; starfield(img,t,0.8)
        k=eb(seg(t,c3[0],c3[0]+0.7))
        logo(img,(640,275),290,seg(t,c3[0],c3[0]+1.3),1.0,t)
        text(img,'DRISHTI',640,520,'b',int(max(10,110*k)),WH)
def sc_throw(img,t,d,C):
    bg(img,t)
    # timeline
    y=250; rr=random.Random(9)
    xs=[150+i*140 for i in range(8)]
    cols=[spec_col(v) for v in (0.1,0.55,0.3,0.8,0.45,0.65,0.2,0.1)]
    cols[7]=spec_col(0.1)
    text(img,'MONTHS OF OBSERVATION',640,70,'b',24,GY,op=eo(seg(t,0,0.6)))
    line(img,(110,y+110),(1170,y+110),GY,3,eo(seg(t,0,0.6)))
    drop=seg(t,C[2][0],C[2][0]+1.2)
    coll=ease(seg(t,C[1][0]+0.4,C[1][0]+3.2))
    for i,x in enumerate(xs):
        a=eb(seg(t,0.2+i*0.08,0.7+i*0.08)); col=cols[i]
        xx=x; yy=y; op=1
        if i in (0,7):
            xx=lerp(x,[430,850][i//7],coll)
        else:
            xx=lerp(x,640,coll*0.55); op=1-coll
            if drop>0: yy=y+drop*drop*480; op=max(0,1-drop*1.1)
        tile(img,xx-50,yy-45,100,90,col,i,op*a)
        if i not in (0,7) and t>C[0][0]+1.0+i*0.28 and coll<0.4: cross(img,(xx,yy),32,RD,0.95*eo(seg(t,C[0][0]+1.0+i*0.28,C[0][0]+1.3+i*0.28)))
    if t>C[0][0]+1.0: text(img,'wavelength ≠ reference → rejected',640,430,'b',30,RD,op=eo(seg(t,C[0][0]+1.0,C[0][0]+1.6))*(1-seg(t,C[1][0]+0.4,C[1][0]+1.0)))
    if coll>0:
        k=eo(seg(t,C[1][0]+1.6,C[1][0]+2.6))
        text(img,'OLDEST',430,y+85,'b',24,WH,op=k); text(img,'NEWEST',850,y+85,'b',24,WH,op=k)
        text(img,'just two points',640,430,'b',44,WH,op=k)
    if drop>0:
        bin_icon(img,(640,570),90,eo(seg(t,C[2][0],C[2][0]+0.5)),drop)
        text(img,'EVERYTHING IN BETWEEN: DROPPED',640,500,'b',32,RD,op=eo(seg(t,C[2][0]+0.4,C[2][0]+1.0)))
def sc_466(img,t,d,C):
    img[:]=NAVY; starfield(img,t,0.35)
    L=C[0][1]-C[0][0]; s0=C[0][0]
    k=seg(t,s0+0.28*L,s0+0.28*L+1.3); v=int(466*ease(k))
    text(img,str(v),640-260,290,'b',190,GR,op=eo(seg(t,s0+0.25*L,s0+0.3*L)))
    text(img,'VISITS KEPT',640-260,410,'m',28,GY,op=eo(seg(t,s0+0.3*L,s0+0.36*L)))
    k2=eo(seg(t,s0+0.52*L,s0+0.6*L))
    text(img,'0',640+260,290,'b',190,RD,op=k2); text(img,'REJECTED',640+260,410,'m',28,GY,op=k2)
    k3=eb(seg(t,s0+0.82*L,s0+0.92*L))
    if k3>0:
        text(img,'NO ANSWER.',640,540,'b',int(max(8,64*k3)),WH)
        text(img,'?',640,130,'b',int(max(8,110*k3)),AM,op=0.9)
def sc_owl(img,t,d,C):
    img[:]=make_bg((90,40,60),(40,20,26)) if False else BGB
    starfield(img,t,0.5)
    # ground cloud
    ell(img,(180,720),(420,120),0,RGB(60,34,70))
    # chart panel
    px,py,pw,ph=560,130,620,380
    rrect(img,px-20,py-30,pw+60,ph+110,20,RGB(18,22,56),-1,0.9); 
    axes(img,px,py,pw,ph,'wavelength  →',col=GY)
    text(img,'brightness',px+60,py-6,'m',18,GY)
    kk=lambda x: py+ph-spectrum_curve(x)*ph*0.9
    xx=lambda x: px+30+x*(pw-60)
    # two pipeline points
    for x in (0.12,0.88):
        circ(img,(xx(x),kk(x)),11,WH); text(img,'kept',xx(x),kk(x)-26,'m',18,WH)
    # noise blobs (mismatched visits)
    tb=C[0][0]
    for i,x in enumerate((0.3,0.45,0.58,0.72)):
        a=seg(t,0.2+i*0.3,0.8+i*0.3)
        if i!=1:
            circ(img,(xx(x)+6*math.sin(t*3+i),kk(x)+(-40 if i%2 else 40)),9,GY,-1,a*(1-seg(t,C[1][0]+0.5,C[1][0]+1.0)))
    # the special one
    tr=seg(t,C[1][0]+0.3,C[1][0]+1.5); x=0.45
    ypos=lerp(kk(x)-80,kk(x),eo(tr)); col=mix(GY,CY,tr)
    a=eb(seg(t,0.4,1.0))
    circ(img,(xx(x),ypos),lerp(9,14,tr),col); dglow(img,(xx(x),ypos),40,CY,0.8*tr)
    if t<C[1][0]: text(img,'noise?',xx(x),ypos-30,'m',18,GY,op=a)
    if tr>0.8:
        text(img,"object's own spectrum",xx(0.5),py+ph+66,'b',24,CY,op=eo(seg(t,C[1][0]+1.4,C[1][0]+2.0))*(1-seg(t,C[1][0]+4.3,C[1][0]+4.6)))
    # curve
    cv=seg(t,C[1][0]+1.6,C[1][0]+3.4)
    if cv>0:
        pts=[(xx(u),kk(u)) for u in np.linspace(0.12,0.12+0.76*cv,60)]
        poly(img,pts,CY,1,th=4,closed=False)
    # owl
    look=(1,0.3) if t<C[1][0] else (0.4,-0.2)
    blink=(int(t*10)%37==0)
    owl(img,260,360,98,t,look,blink,mag=eo(seg(t,0.4,1.0)))
    if t>C[1][0]+4.5:
        text(img,'at a wavelength nobody noticed',xx(0.5),py+ph+66,'b',24,AM,op=eo(seg(t,C[1][0]+4.5,C[1][0]+5.0)))
def sc_reveal(img,t,d,C):
    img[:]=NAVY
    f=seg(t,0,0.25)
    k=eb(seg(t,0.5,1.3))
    for i in range(36):
        a=i/36*6.2832; l=lerp(100,900,eo(seg(t,0.1,0.9))); 
        line(img,(640+130*math.cos(a),300+130*math.sin(a)),(640+l*math.cos(a),300+l*math.sin(a)),mix(NAVY,CY,0.5),2,0.35*(1-seg(t,0.9,2)))
    starfield(img,t,0.7)
    logo(img,(640,275),320,seg(t,0.25,1.6),1.0,t,glow_gain=0.5)
    text(img,'DRISHTI',640,520,'b',int(max(10,120*eb(seg(t,C[1][0]-0.2+0.0,C[1][0]+0.5)))) if t>C[1][0]-0.2 else 10,WH)
    if t<0.35:
        img[:]=cv2.addWeighted(img,1-(1-t/0.35),np.full_like(img,WH),(1-t/0.35),0)
SCENES_A={'plates':sc_plates,'sphx':sc_sphx,'waste':sc_waste,'team':sc_team,'throw':sc_throw,'n466':sc_466,'owl':sc_owl,'reveal':sc_reveal}
