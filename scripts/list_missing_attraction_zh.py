#!/usr/bin/env python3
"""List attraction records with absent/English-only Chinese labels and resolution."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
data=json.loads((ROOT/'data/attractions.json').read_text())
overrides=json.loads((ROOT/'data/attractions_overrides.json').read_text())
lines=['| 国家/城市 | 景点 ID | 英文名 | 当前中文显示 | 处理 |','|---|---|---|---|']
count=0
for country,cities in data['countries'].items():
    for city,items in cities.items():
        for a in items:
            names=a.get('name') or {}; zh=names.get('zh',''); en=names.get('en','')
            manual=overrides.get(a['qid'],{}).get('zh')
            local={'vn':'vi','th':'th','id':'id','my':'id','sg':'id','ph':'id'}.get(country,'')
            local_name=names.get(local,'') if local else ''
            display=manual or (zh if zh and zh.casefold()!=en.casefold() else '') or (local_name if local_name and (local_name.casefold()!=en.casefold() or any(ord(ch)>127 for ch in local_name)) else '')
            if display: continue
            count+=1; display='（缺；不回退英文）'
            note=overrides.get(a['qid'],{}).get('note','')
            status=('人工核定 / '+note if manual and note.startswith('人工') else
                    ('译名待当地母语者复核 / '+note if manual and '待当地母语者复核' in note else
                     ('保留来源当地专名 / '+note if manual else
                      ('界面回退当地语言名 / '+local if local_name and local_name!=en else '仅有英文来源，待核实'))))
            lines.append(f"| {country}/{city} | `{a['qid']}` | {en.replace('|','/')} | {display.replace('|','/')} | {status} |")
out='\n'.join(lines)+'\n'
print(out,end='')
print(f'\n共 {count} 条缺中文标签记录；已配置人工/当地语言覆盖 {sum(1 for a in overrides.values() if a.get("zh"))} 个唯一 ID。')
