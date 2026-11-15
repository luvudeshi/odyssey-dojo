#!/usr/bin/env python3
"""HackUTA '26 demo-video INTRO builder.
Usage (from anywhere):  python3 build_intro.py A      (also B or C for the alternate versions)
Output: final/intro_<version>.mp4   Temp files: build/ (safe to delete)
Needs: ffmpeg built with zscale (libzimg) + libx264, Python 3, a DejaVu font (or set FONT/FONT_MONO env vars)."""
import subprocess, os, sys, glob
ROOT=os.path.dirname(os.path.abspath(__file__)); os.chdir(ROOT)
os.makedirs("build",exist_ok=True); os.makedirs("final",exist_ok=True)
U=os.path.join(ROOT,"source","our_footage")+"/"
KK=os.path.join(ROOT,"source","movie","karate_kid_halloween_1984.mp4")
# Recorded talking clips (in/out points, seconds)
POINT_START,POINT_DUR=0.1,4.16     # IMG_7043: "Instead of being like this... be like this"
PITCH_START,PITCH_DUR=0.0,15.4
MIY_SRC=os.path.join(ROOT,"source","movie","karate_kid_training_pays_off.mp4")   # right-window clip source
MIY_START=197.6                    # Daniel blocking Miyagi's strikes (real speed, ~1.6s used)
FACE_ZOOM=0.7                      # how far the left window zooms into the fence photo face (was 1.4)
GO_MUTE=0.6                        # mute IMG_7043's first 0.6s of the used audio (removes the off-camera "go" at ~0.4-0.55s)
ALPHA=os.path.join(ROOT,"source","derived","IMG_7043_alpha.avi")   # person cut-out matte for IMG_7043 (made by tools/make_matte.py)     # IMG_7048: the pitch / "Odyssey Dojo" whiteboard bit
def _font(env,names):
    if os.environ.get(env): return os.environ[env]
    for n in names:
        for d in ["/usr/share/fonts","/Library/Fonts","/System/Library/Fonts",os.path.expanduser("~/Library/Fonts"),"C:/Windows/Fonts"]:
            hits=glob.glob(f"{d}/**/{n}",recursive=True)
            if hits: return hits[0]
    sys.exit(f"Font not found - set {env}=/path/to/a/bold.ttf")
F=_font("FONT",["DejaVuSans-Bold.ttf","Arial Bold.ttf","arialbd.ttf"])
FM=_font("FONT_MONO",["DejaVuSansMono-Bold.ttf","Courier New Bold.ttf","courbd.ttf"])
def run(a): subprocess.run(["ffmpeg","-v","error","-y"]+a,check=True)
enc=["-an","-c:v","libx264","-crf","18","-preset","veryfast","-pix_fmt","yuv420p","-r","30"]
FIT="scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1"
TM="zscale=tin=arib-std-b67:t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p,eq=brightness=0.0:gamma=1.0"
# Match OUR footage to the 1984 look: cool/teal, low-sat, lifted foggy blacks, soft, grainy
RLOOK=("eq=saturation=0.55:contrast=0.95:gamma=0.8:brightness=-0.04,"
       "colorbalance=rs=-0.06:gs=0.01:bs=0.09:rm=-0.07:gm=0.01:bm=0.06:rh=-0.05:bh=0.03,"
       "curves=all='0/0.035 0.5/0.36 1/0.85'")
SOFT="gblur=sigma=1.1"
OLOOK="eq=saturation=0.95"
FILM="noise=alls=7:allf=t,vignette=PI/5"   # shared on everything so both sources sit together
SRC={"run":(U+"IMG_4145.MOV",TM,True),"4151":(U+"IMG_4151.mov","",False),"4152":(U+"IMG_4152.mov","",False),
     "4153":(U+"IMG_4153.mov","",False),"4154":(U+"IMG_4154.mov","",False)}
def chain(kind):
    if kind=="O": return f"{FIT},{OLOOK},{FILM}"
    f,pre,soft=SRC[kind]; return (pre+"," if pre else "")+FIT+","+RLOOK+(","+SOFT if soft else "")+","+FILM
def src(kind): return KK if kind=="O" else SRC[kind][0]
def shot(out,kind,ss,d,extra=""):
    vf=chain(kind)+(","+extra if extra else "")+",fps=30"
    run(["-ss",str(ss),"-t",str(d),"-i",src(kind),"-vf",vf]+enc+[out]); return out
def still(out,d):
    # Fake "handheld video" from the still: push-in + layered handheld shake + micro-rotation
    # + motion blur from the shake + per-frame grain/flicker, then the same grade as our clips.
    N=int(d*60)
    SX="18*sin(2*PI*t*1.3+0.4)+9*sin(2*PI*t*3.7+1.1)+4*sin(2*PI*t*8.9)"
    SY="12*sin(2*PI*t*1.1+2.0)+7*sin(2*PI*t*4.3+0.3)+3*sin(2*PI*t*9.7+1.7)"
    vf=("scale=2880:2160,crop=2880:1620:0:300,scale=2112:1188,"
        f"zoompan=z='1+0.07*(1-pow(1-on/{N},2))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=2112x1188:fps=60,"
        "rotate=a='0.006*sin(2*PI*t*1.7)+0.003*sin(2*PI*t*5.3)':c=black,"
        f"crop=1920:1080:x='96+{SX}':y='54+{SY}',"
        "tmix=frames=3:weights='1 2 1',fps=30,"
        "eq=brightness=0.012*sin(2*PI*t*7.0):eval=frame,"
        +RLOOK+","+SOFT+","+FILM+",noise=alls=4:allf=t,eq=saturation=0.8")
    run(["-loop","1","-framerate","60","-t",str(d),"-i",U+"IMG_4155.webp","-vf",vf]+enc+[out]); return out
def tag(txt,pos="tl"):
    x="60" if pos=="tl" else "w-text_w-60"
    return (f"drawtext=fontfile={FM}:text='{txt}':x={x}:y=50:fontsize=54:fontcolor=white@0.9:borderw=3:bordercolor=black@0.6")
# ---------- shared ending (freeze -> PiP -> pitch -> title) ----------
def ending(name):
    run(["-ss","1.85","-i",U+"IMG_4153.mov","-frames:v","1","-vf",chain("4153"),"build/freeze.png"])
    run(["-loop","1","-t","0.6","-i","build/freeze.png","-vf","zoompan=z='1.08':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=30,eq=saturation=0.3,"
         "drawbox=x=0:y=0:w=iw:h=ih:color=white@0.5:t=fill:enable='lt(t,0.07)'"]+enc+["build/e0.mp4"])
    run(["-loop","1","-t","0.7","-i","build/freeze.png","-vf","eq=saturation=0.3,fps=30"]+enc+["build/fz.mp4"])
    def bg(lines):
        p=["drawbox=x=30:y=30:w=1860:h=1020:color=yellow@0.9:t=6"]
        for i,(t,s,c) in enumerate(lines):
            fn=f"build/t{abs(hash(t))}.txt"; open(fn,"w").write(t)
            p.append(f"drawtext=fontfile={F}:textfile={fn}:x=(w-text_w)/2:y={520+i*100}:fontsize={s}:fontcolor={c}")
        return ",".join(p)
    def pip(out,inp,d,mode,lines):
        if mode=="shrink": P="(1-pow(1-min(t/0.7,1),3))"; W=f"(1920-1280*{P})"; Y=f"(40*{P})"
        elif mode=="hold": W="640"; Y="40"
        else: K="(0.7+0.3*min(t/0.25,1))"; W=f"(640*{K})"; Y=f"(40+(360-640*{K}*9/16)/2)"
        fc=(f"[1:v]drawbox=x=0:y=0:w=iw:h=ih:color=yellow:t=14,scale=w='trunc({W}/2)*2':h='trunc({W}*9/32)*2':eval=frame,setsar=1[c];"
            f"[0:v]{bg(lines)}[b];[b][c]overlay=x='(W-w)/2':y='{Y}':eval=frame:shortest=1,format=yuv420p[v]")
        run(["-f","lavfi","-i",f"color=c=0x1a0a2e:s=1920x1080:r=30:d={d}","-t",str(d),"-i",inp,"-filter_complex",fc,"-map","[v]","-t",str(d)]+enc+[out])
    # ---------- POINTING BEAT over our recorded clip IMG_7043 ----------
    # Background = IMG_7043 (cowboy-hat guy at the whiteboard). He points up-LEFT on
    # "Instead of being like this" (~1.4-2.2s) and up-RIGHT on "be like this" (~2.8-3.3s).
    P0,PD=POINT_START,POINT_DUR                      # clip in-point / length used
    T_SHRINK,T_RW,T_SZ=0.7,0.6,1.25                  # shrink, rewind, still-zoom
    T_MIY=T_SHRINK+T_RW+T_SZ                         # Miyagi appears (= freeze point of the face)
    LX,RX,WY,WW,WH=384,1027,20,520,292               # left/right window slots (above his hands, person centred)
    SHIFT=94                                         # moves the cut-out person so his torso sits at x=960
    # --- virtual background: the game's storm title art (Scylla & Charybdis) + animated rain + lightning on Miyagi ---
    N=int(PD*30)
    run(["-loop","1","-framerate","30","-t",str(PD),"-i",os.path.join(ROOT,"source","kit","01-menu-scene-scylla-and-charybdis.png"),"-vf",
         f"scale=2112:1188,zoompan=z='1+0.06*on/{N}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=30,eq=brightness=-0.03","-t",str(PD)]+enc+["build/storm_base.mp4"])
    T_M=T_SHRINK+T_RW+T_SZ
    rain=(f"color=c=black:s=1920x1080:r=30:d={PD},noise=alls=100:allf=t,lutyuv=y='if(gt(val,252),255,0)':u=128:v=128,"
          "avgblur=sizeX=1:sizeY=18,rotate=0.18:c=black,format=yuv420p[r];"
          "[0:v][r]blend=c0_mode=screen:c0_opacity=0.45:c1_mode=normal:c1_opacity=1:c2_mode=normal:c2_opacity=1,"
          f"eq=brightness='if(between(t,{T_M},{T_M+0.07})+between(t,{T_M+0.14},{T_M+0.2}),0.25,0)':eval=frame[v]")
    run(["-i","build/storm_base.mp4","-filter_complex",rain,"-map","[v]","-t",str(PD)]+enc+["build/storm_bg.mp4"])
    amb=f"build/{name}_amb.mp4"; A=dur(amb)
    # VHS fast-rewind of the ambush
    run(["-ss",str(A-4.8),"-i",amb,"-vf","scale=960:540,reverse,setpts=PTS/8,fps=30,scale=1920:1080,"
         "rgbashift=rh=-10:bh=10,noise=alls=35:allf=t,eq=contrast=1.2:brightness=0.03:gamma=1.4,"
         "drawbox=x=0:y='mod(t*2600,1080)':w=iw:h=60:color=white@0.25:t=fill,"
         f"drawtext=fontfile={F}:text='◀◀ REW':x=70:y=60:fontsize=110:fontcolor=white:borderw=4:bordercolor=black",
         "-t",str(T_RW)]+enc+["build/rw.mp4"])
    # fence still -> zoom into his face with handheld shake
    SX="10*sin(2*PI*t*1.3+0.4)+5*sin(2*PI*t*3.7+1.1)"; SY="7*sin(2*PI*t*1.1+2.0)+4*sin(2*PI*t*4.3)"
    run(["-loop","1","-framerate","30","-t",str(T_SZ),"-i",U+"IMG_4155.webp","-vf",
         "scale=2880:2160,crop=2880:1620:0:300,scale=3840:2160,"
         f"zoompan=z='1+{FACE_ZOOM}*(1-pow(1-min(on/{int(T_SZ*30)-3},1),3))':x='iw*0.38-iw/zoom/2':y='ih*0.39-ih/zoom/2':d=1:s=2016x1134:fps=30,"
         f"crop=1920:1080:x='48+{SX}':y='27+{SY}',"+RLOOK+","+FILM+",eq=gamma=1.2:saturation=0.85,"
         "drawbox=x=0:y=0:w=iw:h=ih:color=white@0.8:t=fill:enable='lt(t,0.07)'"]+enc+["build/sz.mp4"])
    run(["-sseof","-0.05","-i","build/sz.mp4","-frames:v","1","-update","1","build/zf.png"])
    hold=PD-T_MIY
    run(["-loop","1","-t",str(hold),"-i","build/zf.png","-vf","fps=30"]+enc+["build/zh.mp4"])
    concat(["build/fz.mp4","build/rw.mp4","build/sz.mp4","build/zh.mp4"],"build/left.mp4")
    # right window: Miyagi attacks, Daniel BLOCKS (training-pays-off scene), real speed, brightened for the small window
    run(["-ss",str(MIY_START),"-t",str(hold),"-i",MIY_SRC,"-vf",
         "scale=1920:1080,setsar=1,eq=saturation=0.95:gamma=1.25:brightness=0.02,noise=alls=7:allf=t,vignette=PI/5,fps=30"]+enc+["build/miy.mp4"])
    # composite: left window shrinks from full-screen into its slot, Miyagi pops into the right slot
    E=f"(1-pow(1-min(t/{T_SHRINK},1),3))"
    LW=f"(1920-(1920-{WW})*{E})"
    K=f"(0.6+0.4*min(max(t-{T_MIY},0)/0.25,1))"
    FGC="eq=brightness=-0.06:saturation=0.85,colorbalance=rs=-0.05:bs=0.06:rm=-0.03:bm=0.04"   # cool him down to sit in the storm
    fc=(f"[0:v]setpts=PTS-STARTPTS,scale=1920:1080,{FGC},format=rgba[fgc];"
        f"[3:v]setpts=PTS-STARTPTS,scale=1920:1080,format=gray,erosion,erosion,erosion,gblur=sigma=1.3[al];[fgc][al]alphamerge[p];"
        f"[4:v]fps=30,setpts=PTS-STARTPTS,vignette=PI/5[sb];[sb][p]overlay=x={SHIFT}:y=0:shortest=1[bg];"
        f"[1:v]drawbox=x=0:y=0:w=iw:h=ih:color=yellow:t=16,scale=w='trunc({LW}/2)*2':h='trunc({LW}*9/32)*2':eval=frame,setsar=1[l];"
        f"[2:v]setpts=PTS-STARTPTS+{T_MIY}/TB,drawbox=x=0:y=0:w=iw:h=ih:color=yellow:t=16,scale=w='trunc({WW}*{K}/2)*2':h='trunc({WW}*{K}*9/32)*2':eval=frame,setsar=1[r];"
        f"[bg][l]overlay=x='{LX}*{E}':y='{WY}*{E}':eval=frame[t];"
        f"[t][r]overlay=x='{RX}+({WW}-w)/2':y='{WY}+({WH}-h)/2':eval=frame:enable='gte(t,{T_MIY})',format=yuv420p[v]")
    run(["-ss",str(P0),"-t",str(PD),"-i",U+"IMG_7043.mp4","-i","build/left.mp4","-i","build/miy.mp4",
         "-ss",str(P0),"-t",str(PD),"-i",ALPHA,"-i","build/storm_bg.mp4",
         "-filter_complex",fc,"-map","[v]","-t",str(PD)]+enc+["build/e1.mp4"])
    # ---------- PITCH: our recorded clip IMG_7048 ----------
    run(["-ss",str(PITCH_START),"-t",str(PITCH_DUR),"-i",U+"IMG_7048.mp4","-vf",FIT+",fps=30"]+enc+["build/e2.mp4"])
    open("build/ct.txt","w").write("GAME TITLE CARD"); open("build/cs.txt","w").write("logo + game theme music")
    run(["-f","lavfi","-i","color=c=0x001a2e:s=1920x1080:r=30:d=1.5","-vf","drawbox=x=30:y=30:w=1860:h=1020:color=yellow@0.9:t=6,"
         f"drawtext=fontfile={F}:textfile=build/ct.txt:x=(w-text_w)/2:y=420:fontsize=84:fontcolor=cyan,drawtext=fontfile={F}:textfile=build/cs.txt:x=(w-text_w)/2:y=560:fontsize=52:fontcolor=white"]+enc+["build/e3.mp4"])
    concat([f"build/e{i}.mp4" for i in range(4)],f"build/{name}_end.mp4")
def concat(files,out):
    open(out+".txt","w").write("".join(f"file '{os.path.abspath(f)}'\n" for f in files))
    run(["-f","concat","-safe","0","-i",out+".txt","-c","copy",out])
def dur(f): return float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",f]))
def finish(name,amb_files,bed_start):
    concat(amb_files,f"build/{name}_amb.mp4"); amb=dur(f"build/{name}_amb.mp4"); ending(name)
    concat([f"build/{name}_amb.mp4",f"build/{name}_end.mp4"],f"build/{name}_v.mp4")
    run(["-ss",str(bed_start),"-t",str(amb),"-i",KK,"-af",f"afade=t=out:st={amb-0.15}:d=0.15","-ar","48000","-ac","2",f"build/{name}_bed.wav"])
    if not os.path.exists("build/scratch.wav"):
        run(["-f","lavfi","-i","aevalsrc='0.7*sin(2*PI*t*(1400-3200*t))*exp(-5*t)+0.35*(random(0)-0.5)*exp(-8*t)':s=48000:d=0.4","-ac","2","build/scratch.wav"])
        run(["-ss","76.0","-t","3.0","-i",KK,"-af","volume=0.35,afade=t=in:d=0.1,afade=t=out:st=2.7:d=0.3","-ar","48000","-ac","2","build/miy.wav"])
    T0=amb+0.6                                      # pointing beat starts after the 0.6s freeze
    fz=int(amb*1000); rw=int((T0+0.7)*1000); my=int((T0+2.55)*1000)
    pt=int(T0*1000); pc=int((T0+POINT_DUR)*1000); total=T0+POINT_DUR+PITCH_DUR+1.5
    run(["-ss",str(amb-4.8),"-i",f"build/{name}_bed.wav","-af","areverse,asetrate=48000*8,aresample=48000,volume=3.0,atrim=0:0.6","-ac","2",f"build/{name}_rw.wav"])
    run(["-ss",str(POINT_START),"-t",str(POINT_DUR),"-i",U+"IMG_7043.mp4","-vn","-af","volume=1.4,volume=0:enable='lt(t,"+str(GO_MUTE)+")',afade=t=in:st="+str(GO_MUTE)+":d=0.05,afade=t=out:st="+str(POINT_DUR-0.1)+":d=0.1","-ar","48000","-ac","2","build/point.wav"])
    run(["-ss",str(PITCH_START),"-t",str(PITCH_DUR),"-i",U+"IMG_7048.mp4","-vn","-af","volume=1.2,afade=t=in:d=0.05,afade=t=out:st="+str(PITCH_DUR-0.2)+":d=0.2","-ar","48000","-ac","2","build/pitch.wav"])
    run(["-ss",str(MIY_START),"-t",str(POINT_DUR-2.55),"-i",MIY_SRC,"-af","volume=0.3,afade=t=in:d=0.1","-ar","48000","-ac","2","build/miy_q.wav"])
    run(["-i",f"build/{name}_bed.wav","-i","build/scratch.wav","-i","build/miy_q.wav","-i",f"build/{name}_rw.wav","-i","build/point.wav","-i","build/pitch.wav","-filter_complex",
         f"[1]adelay={fz}|{fz}[s];[2]adelay={my}|{my}[m];[3]adelay={rw}|{rw}[w];[4]adelay={pt}|{pt}[p];[5]adelay={pc}|{pc}[q];"
         f"[0][s][m][w][p][q]amix=inputs=6:normalize=0:duration=longest,apad[a]","-map","[a]","-t",str(total+0.5),f"build/{name}.wav"])
    run(["-i",f"build/{name}_v.mp4","-i",f"build/{name}.wav","-map","0:v","-map","1:a","-c:v","copy","-c:a","aac","-b:a","192k","-shortest",f"final/{name}.mp4"])
    print(name, round(amb,2), round(dur(f"final/{name}.mp4"),2))
which=sys.argv[1]
# ---------- A: SHOT-FOR-SHOT (interleaved, action-matched cuts) ----------
if which=="A":
    a=[shot("build/a1.mp4","O",3.0,1.3), shot("build/a2.mp4","run",0.2,1.2),        # run L->R  <-> run L->R
       shot("build/a3.mp4","O",12.5,1.3),shot("build/a4.mp4","run",3.8,1.3),        # skeletons gaining <-> chasers burst past
       shot("build/a5.mp4","O",20.0,1.3),shot("build/a6.mp4","4154",3.2,1.5),       # pulled off the fence (wide) <-> pulled off the fence
       shot("build/a7.mp4","O",25.2,1.3),shot("build/a8.mp4","4152",1.0,1.3),       # skeleton headlock <-> headlock
       shot("build/a9.mp4","4153",1.0,0.85)]                                     # knee -> freeze
    finish("intro_A_shot_for_shot",a,3.0)
# ---------- B: SPLIT-SCREEN (1984 vs 2026, synced side by side) ----------
if which=="B":
    def split(out,ss,kind,rs,d,extra_r=""):
        L=chain("O")+",scale=944:532"; Rr=chain(kind)+(","+extra_r if extra_r else "")+",scale=944:532"
        fc=(f"[0:v]{L},fps=30[l];[1:v]{Rr},fps=30[r];color=c=black:s=1920x1080:r=30:d={d}[bg];"
            f"[bg][l]overlay=x=12:y=274[t];[t][r]overlay=x=964:y=274:shortest=1,"
            f"drawtext=fontfile={FM}:text='1984':x=12+(944-text_w)/2:y=190:fontsize=56:fontcolor=white,"
            f"drawtext=fontfile={FM}:text='2026':x=964+(944-text_w)/2:y=190:fontsize=56:fontcolor=red,format=yuv420p[v]")
        run(["-ss",str(ss),"-t",str(d),"-i",KK,"-ss",str(rs),"-t",str(d),"-i",src(kind),"-filter_complex",fc,"-map","[v]","-t",str(d)]+enc+[out]); return out
    b=[split("build/b1.mp4",3.0,"run",0.0,1.8),      # run
       split("build/b2.mp4",12.5,"run",3.8,1.8),     # chase
       split("build/b3.mp4",20.0,"4154",3.0,2.0),    # caught at the fence (wide)
       split("build/b4.mp4",25.2,"4152",1.0,1.6),    # headlock
       shot("build/b5.mp4","4153",1.0,0.85)]         # go full-screen on the knee -> freeze
    finish("intro_B_split_screen",b,3.0)
# ---------- C: THEN vs NOW (movie plays, then our remake mirrors it; 1 switch) ----------
if which=="C":
    t84=tag("PLAY  1984"); t26=tag("REC  2026")+",drawtext=fontfile="+FM+":text='●':x=40:y=48:fontsize=54:fontcolor=red:enable='lt(mod(t,1),0.6)'"
    t26=tag("     REC  2026")+",drawtext=fontfile="+FM+":text='o':x=62:y=46:fontsize=58:fontcolor=red:enable='lt(mod(t,1)\\,0.6)'"
    c=[shot("build/c1.mp4","O",3.0,1.3,t84),shot("build/c2.mp4","O",12.5,1.2,t84),
       shot("build/c3.mp4","O",20.0,1.3,t84),shot("build/c4.mp4","O",25.2,1.2,t84)]
    # VHS-style glitch transition
    run(["-ss","26.2","-t","0.35","-i",KK,"-vf",chain("O")+",rgbashift=rh=-12:bh=12,noise=alls=60:allf=t,eq=contrast=1.4,fps=30"]+enc+["build/c5.mp4"]); c.append("build/c5.mp4")
    c+=[shot("build/c6.mp4","run",0.2,1.2,t26),shot("build/c7.mp4","run",3.8,1.2,t26),
        shot("build/c8.mp4","4154",3.0,1.3,t26),shot("build/c9.mp4","4152",1.0,1.2,t26),
        shot("build/c10.mp4","4153",1.0,0.85,t26)]
    finish("intro_C_then_vs_now",c,3.0)
