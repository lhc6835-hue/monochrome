const {getIconData}=require('@iconify/utils');
const packs={maki:require('@iconify-json/maki/icons.json'),mdi:require('@iconify-json/mdi/icons.json'),ms:require('@iconify-json/material-symbols/icons.json')};
const map={tree:'maki:park',pine:'mdi:pine-tree',tree2:'ms:nature',pine2:'maki:park-alt1',
house:'maki:home',homeCity:'mdi:home-city',office:'mdi:office-building',building:'maki:building',tower:'maki:building-alt1',townHall:'maki:town-hall',industry:'maki:industry',factory:'mdi:factory',
lamp:'mdi:post-lamp',trafficLight:'mdi:traffic-light',bench:'mdi:bench',hydrant:'mdi:fire-hydrant',cctv:'mdi:cctv',mailbox:'mdi:mailbox',clock:'mdi:clock-time-four',signpost:'mdi:sign-direction',trash:'mdi:trash-can',barrier:'mdi:sign-caution',warning:'mdi:alert',
car:'maki:car',bus:'maki:bus',bicycle:'maki:bicycle',train:'mdi:train',bird:'mdi:bird',cat:'mdi:cat',dog:'maki:dog-park',
slide:'mdi:slide',seesaw:'mdi:seesaw',ferris:'mdi:ferris-wheel',balloon:'mdi:balloon',crate:'mdi:package-variant-closed',door:'mdi:door-closed',ladder:'mdi:ladder',fence:'maki:fence',umbrella:'mdi:umbrella',grave:'mdi:grave-stone',lighthouse:'mdi:lighthouse',radioTower:'mdi:radio-tower',bell:'mdi:bell',key:'mdi:key',lock:'mdi:lock',bulb:'mdi:lightbulb',tv:'mdi:television-classic',bookshelf:'mdi:bookshelf',piano:'mdi:piano',toiletSign:'maki:toilet',info:'maki:information',phone:'maki:telephone',crane:'mdi:crane',bridge:'mdi:bridge',stairs:'mdi:stairs',fan:'mdi:fan',pipe:'mdi:pipe',wall:'mdi:wall',wateringCan:'mdi:watering-can',hat:'mdi:hat-fedora',chair:'mdi:chair-school',sprout:'mdi:sprout'};
const out={};const credits=new Set();
for(const [k,id] of Object.entries(map)){const [p,n]=id.split(':');const d=getIconData(packs[p],n);if(!d)throw new Error(id);
 const body=d.body;const paths=[];const re=/<path([^>]*)\/?>/g;let m;let rest=body;
 while((m=re.exec(body))){const a=m[1];const dd=/ d="([^"]+)"/.exec(a);const fr=/fill-rule="([^"]+)"/.exec(a);paths.push(fr?[dd[1],1]:[dd[1]]);rest=rest.replace(m[0],'');}
 rest=rest.replace(/<\/?g[^>]*>/g,'').replace(/<\/path>/g,'').trim();
 if(rest||/transform|opacity|fill="none"|stroke/.test(body)) console.error('WARN',k,id,body.slice(0,200));
 out[k]={w:d.width,h:d.height,p:paths,src:id};credits.add(p);}
const ts=`// 자동 생성 파일 (scripts/extract-icons). 수정하지 마세요.
// 출처: Maki by Mapbox (CC0-1.0), Material Design Icons by Pictogrammers (Apache-2.0), Material Symbols by Google (Apache-2.0)
export interface IconDef { w: number; h: number; p: ([string] | [string, 1])[]; src: string }
export const ICONS = ${JSON.stringify(out)} as const satisfies Record<string, IconDef>;
export type IconName = keyof typeof ICONS;
`;
require('fs').writeFileSync(require('path').join(__dirname,'..','src','gfx','iconData.ts'),ts);console.log(Object.keys(out).length,'icons',ts.length,'bytes');
