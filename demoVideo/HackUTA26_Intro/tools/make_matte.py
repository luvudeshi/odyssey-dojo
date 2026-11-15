import cv2, numpy as np, sys
U=sys.argv[1]
cap=cv2.VideoCapture(U); fr=[]
while True:
    ok,f=cap.read()
    if not ok: break
    fr.append(f)
fr=np.array(fr); N,H,W,_=fr.shape
plate=np.median(fr,axis=0).astype(np.float32)
# core region the person never leaves -> fill by row-wise interpolation from its left/right edges
x0,x1,y0=470,700,200
for y in range(y0,H):
    L=plate[y,x0-6:x0].mean(0); R=plate[y,x1:x1+6].mean(0)
    t=np.linspace(0,1,x1-x0)[:,None]
    plate[y,x0:x1]=L*(1-t)+R*t
plate=cv2.GaussianBlur(plate,(0,0),1.0)
cv2.imwrite("plate.png",plate.astype(np.uint8))
# where the person can possibly be (arms reach wide above the board edge, only legs below it)
ROI=np.zeros((H,W),np.uint8); ROI[150:470,320:910]=1; ROI[470:,485:705]=1
# reference area for exposure compensation (never covered by the person, no backpack)
REF=np.zeros((H,W),bool); REF[20:640,:280]=True; REF[20:500,950:]=True
def segment(plate):
    pl_lab=cv2.cvtColor(plate.astype(np.uint8),cv2.COLOR_BGR2LAB).astype(np.float32)
    masks=[]
    for i,f in enumerate(fr):
        g=(plate[REF].mean(0)/(f.astype(np.float32)[REF].mean(0)+1e-3))
        f=np.clip(f.astype(np.float32)*g,0,255).astype(np.uint8)
        lab=cv2.cvtColor(cv2.GaussianBlur(f,(0,0),1.2),cv2.COLOR_BGR2LAB).astype(np.float32)
        d=np.sqrt(((lab-pl_lab)*np.array([0.8,1.6,1.6]))**2).sum(2)
        m=((d>22)&(ROI>0)).astype(np.uint8)
        raw=cv2.morphologyEx(m,cv2.MORPH_CLOSE,np.ones((5,5),np.uint8))
        m=cv2.morphologyEx(m,cv2.MORPH_OPEN,np.ones((3,3),np.uint8))
        m=cv2.morphologyEx(m,cv2.MORPH_CLOSE,np.ones((9,9),np.uint8))
        # keep components touching the core (the person)
        n,lbl,st,_=cv2.connectedComponentsWithStats(m)
        keep=np.zeros_like(m)
        for k in range(1,n):
            x,y,w,h,a=st[k]
            if a>400 and x< x1 and x+w> x0 and y+h>y0+50: keep[lbl==k]=1
        # fill holes
        ff=keep.copy()*255; h2=np.zeros((H+2,W+2),np.uint8); inv=ff.copy()
        cv2.floodFill(inv,h2,(0,0),255); keep=((ff|(255-inv))>0).astype(np.uint8)
        # GrabCut refine around the edge band
        gc=np.where(keep>0,cv2.GC_PR_FGD,cv2.GC_PR_BGD).astype(np.uint8)
        gc[cv2.erode(keep,np.ones((15,15),np.uint8))>0]=cv2.GC_FGD
        gc[cv2.dilate(keep,np.ones((25,25),np.uint8))==0]=cv2.GC_BGD
        bg=np.zeros((1,65),np.float64); fg=np.zeros((1,65),np.float64)
        try:
            cv2.grabCut(f,gc,None,bg,fg,2,cv2.GC_INIT_WITH_MASK)
            keep=(np.isin(gc,[cv2.GC_FGD,cv2.GC_PR_FGD])&(ROI>0)).astype(np.uint8)
        except Exception as e: pass
        # colour veto: whiteboard-white is never the person (hat is warmer, b>8); beige wall between the legs isn't either
        Lc=lab[...,0]; bc=lab[...,2]-128
        veto=(Lc>170)&(bc<8)
        veto[555:695]|=((bc>6)&(Lc>125))[555:695]
        keep=(keep&(~veto)).astype(np.uint8)
        keep=cv2.morphologyEx(keep,cv2.MORPH_OPEN,np.ones((5,5),np.uint8))
        # largest blob only, and don't let hole-filling bridge the gap between the legs
        n,lbl,st,_=cv2.connectedComponentsWithStats(keep)
        if n>1: keep=(lbl==1+np.argmax(st[1:,4])).astype(np.uint8)
        keep[555:]=keep[555:]&raw[555:]
        masks.append(keep.astype(np.float32))
    
    return np.array(masks)
masks=segment(plate)
# refine the plate: for every pixel, median of the frames where the person is NOT there
for it in range(2):
    free=np.array([cv2.dilate(m.astype(np.uint8),np.ones((11,11),np.uint8))==0 for m in masks])
    cnt=free.sum(0)
    med=np.zeros_like(plate)
    for r0 in range(0,H,60):   # row chunks to keep memory low
        st_=np.where(free[:,r0:r0+60,:,None],fr[:,r0:r0+60].astype(np.float32),np.nan)
        med[r0:r0+60]=np.nan_to_num(np.nanmedian(st_,axis=0))
    upd=cnt>=3
    plate[upd]=med[upd]
    masks=segment(plate)
cv2.imwrite("plate2.png",plate.astype(np.uint8))

# temporal smoothing (3-frame) + soft edges
out=[]
for i in range(N):
    a=masks[max(0,i-1):i+2].mean(0)
    a=(a>0.5).astype(np.float32)
    a=cv2.erode(a,np.ones((3,3),np.uint8))
    a=cv2.GaussianBlur(a,(0,0),1.6)
    out.append((a*255).astype(np.uint8))
w=cv2.VideoWriter("alpha.avi",cv2.VideoWriter_fourcc(*"FFV1"),30,(W,H),False)
for a in out: w.write(a)
w.release()
cv2.imwrite("a_mid.png",out[60]); cv2.imwrite("a_pt.png",out[57]); 
print("done",N)
cv2.imwrite("dbg_m90.png",(masks[90]*255).astype(np.uint8))
f=fr[90]; g=(plate[REF].mean(0)/(f.astype(np.float32)[REF].mean(0)+1e-3)); f=np.clip(f.astype(np.float32)*g,0,255).astype(np.uint8)
lab=cv2.cvtColor(cv2.GaussianBlur(f,(0,0),1.2),cv2.COLOR_BGR2LAB)
print("lab@287,508",lab[287,508], "mask",masks[90][287,508])
