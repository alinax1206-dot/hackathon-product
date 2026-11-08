/** ChatAloud chat mascot. Four states; no audio, API, opening, or dependencies.
 * Sprite tiles: neutral, closed, smile, listening, thinking(no rays), speaking,
 * then three original orange rays ordered lower-left to upper-right.
 */
export class ChatMascot extends HTMLElement {
  static observedAttributes = ['state','motion'];
  constructor() {
    super();
    this.attachShadow({mode:'open'}).innerHTML=`<style>:host{display:block;width:160px;max-width:100%;aspect-ratio:1}canvas{width:100%;height:100%;display:block}</style><canvas width="512" height="512" aria-hidden="true"></canvas>`;
    this.ctx=this.shadowRoot.querySelector('canvas').getContext('2d');
    this.mix=document.createElement('canvas');this.mix.width=this.mix.height=384;
    this.mc=this.mix.getContext('2d');this.image=new Image();
    this._raf=0;this._start=0;this._state='idle';this._stopped=false;this._loaded=false;
    this.media=matchMedia('(prefers-reduced-motion: reduce)');
    this._refresh=()=>this._restart();
  }
  connectedCallback() {
    this.media.addEventListener('change',this._refresh);
    document.addEventListener('visibilitychange',this._refresh);
    this.image.onload=()=>{this._loaded=true;this._restart();};
    this.image.onerror=()=>{this._loaded=false;cancelAnimationFrame(this._raf);this.dispatchEvent(new CustomEvent('mascot-error',{bubbles:true,detail:{message:'Mascot image could not load.'}}));};
    this.image.src=this.getAttribute('src')||'/motion/mascot.webp';
    this._state=this.getAttribute('state')||'idle';this._restart();
  }
  disconnectedCallback(){cancelAnimationFrame(this._raf);this.media.removeEventListener('change',this._refresh);document.removeEventListener('visibilitychange',this._refresh);}
  attributeChangedCallback(name,old,value){if(old===value)return;if(name==='state'){if(!['idle','listening','thinking','speaking'].includes(value)){this._state='idle';}else this._state=value;this._stopped=false;}if(this.isConnected)this._restart();}
  setState(value){if(!['idle','listening','thinking','speaking'].includes(value))throw new Error('Use idle, listening, thinking, or speaking');if(this.getAttribute('state')===value){if(this._stopped){this._stopped=false;this._restart();}return;}this.setAttribute('state',value);}
  setMotionEnabled(value){this.setAttribute('motion',value?'on':'off');}
  stop(){this._stopped=true;cancelAnimationFrame(this._raf);if(this._loaded)this.draw(0,true);}
  _restart(){cancelAnimationFrame(this._raf);if(!this._loaded||!this.isConnected)return;this._start=performance.now();this._tick(this._start);}
  _tick(now){
    if(!this.isConnected)return;
    const still=this._stopped||this.media.matches||this.getAttribute('motion')==='off';
    this.draw((now-this._start)/1000,still);
    if(!still&&!document.hidden)this._raf=requestAnimationFrame(t=>this._tick(t));
  }
  _tile(ctx,id,alpha=1){if(alpha<=0)return;ctx.globalAlpha=alpha;ctx.drawImage(this.image,(id%3)*256,Math.floor(id/3)*256,256,256,0,0,384,384);ctx.globalAlpha=1;}
  draw(t,still=false){
    const state=this._state,c=this.ctx,m=this.mc,TAU=Math.PI*2;
    let id=0,w=0,y=0,scale=1,angle=0;
    const pulse=(v,a,b)=>Math.max(0,Math.min(1,(v-a)/.07,(b-v)/.07));
    if(state==='idle'&&!still){const v=t%4;w=pulse(v,.9,1.8);id=2;if(!w){id=1;w=pulse(v,2.4,2.72);}y=-2*Math.sin(TAU*t/4);}
    if(state==='listening'){id=3;w=1;if(!still){scale=1+.01*Math.sin(TAU*t/2);angle=-2*Math.sin(TAU*t/2);}}
    if(state==='thinking'){id=4;w=1;/* Body stays still: only the original rays alternate. */}
    if(state==='speaking'){id=5;w=still?1:pulse(t%.65,0,.48);if(!still){y=-1.5*Math.sin(TAU*t/2);scale=1+.012*Math.sin(TAU*t*2);}}
    m.clearRect(0,0,384,384);m.globalCompositeOperation='source-over';this._tile(m,0,1-w);m.globalCompositeOperation='lighter';this._tile(m,id,w);m.globalCompositeOperation='source-over';
    if(state==='thinking'){
      // One soft pulse per ray, left to right, with brief overlap. 1.8s loop.
      for(let i=0;i<3;i++){const phase=((t-i*.6)%1.8+1.8)%1.8;const a=still?1:phase<.72?Math.sin(Math.PI*phase/.72)**2:0;this._tile(m,6+i,a);}
    }
    c.clearRect(0,0,512,512);
    c.save();c.fillStyle='rgba(31,56,91,.10)';c.filter='blur(5px)';c.beginPath();c.ellipse(256,447,62,7,0,0,TAU);c.fill();c.restore();
    c.save();c.translate(256,245+y);c.rotate(angle*Math.PI/180);c.scale(scale,scale);c.drawImage(this.mix,-192,-192);c.restore();
  }
}
if(!customElements.get('chat-mascot'))customElements.define('chat-mascot',ChatMascot);
