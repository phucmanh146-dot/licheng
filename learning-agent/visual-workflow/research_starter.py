"""Transparent first-step routing. Rules propose actions, not research findings."""
def propose(data):
    interest=str(data.get('interest','')).strip()[:500]
    materials=str(data.get('materials','')).strip()[:5000]
    phenomenon=str(data.get('phenomenon','')).strip()[:1000]
    minutes=data.get('minutes',20)
    if type(minutes)!=int or not 5<=minutes<=180:raise ValueError('请填写5至180分钟')
    if not interest or interest in ('不知道','迷茫','没方向'):
        route='先找到一个你能描述的现象'
        goal='形成一张具体困惑卡，暂不确定研究结论或大课题'
        action='写下最近一次学习中“想达到什么、实际发生什么、哪一步不明白”各一句；只选其中能说明时间和场景的一次，不要求先找论文。'
        output='困惑卡：一次具体场景＋想达到的结果＋实际困难＋一个待问问题'
        why='连兴趣范围还没有确认，先提供一个可讨论的具体场景，比继续泛找选题更容易推进。'
        criteria=['说明一次具体场景，不能只有“想做科研/想变优秀”。','愿望与实际困难分别写出，没有把猜测当研究发现。','提出一个可以向助教解释的问题，暂不声称选题已成立。']
    elif not materials:
        route='先验证这个兴趣能否取得一份材料'
        goal=f'把“{interest}”缩成一个有场景、有材料入口的候选问题'
        action=f'围绕“{phenomenon or interest}”填写一行：谁在什么场景遇到什么具体困难、能从哪里取得一份材料、目前还不知道什么；没有材料就记录待索取对象，不编造观察结果。'
        output='研究问题候选卡：对象／场景／具体问题／一份可取得材料／未知项'
        why='有兴趣不等于已有可研究的证据。先确认材料入口，再决定方法，避免立刻铺开大范围阅读。'
        criteria=['对象和场景明确，问题不是整个领域或“提升所有人的能力”。','列出真实可取得材料的入口；未取得明确写未取得。','区分候选问题与研究结论，明确下一步向谁核对可行性。']
    elif minutes<=15:
        route='已有材料，先完成一条证据定位'
        goal=f'从“{interest}”现有材料中得到一条可回查的问题线索'
        action='只选现有材料的一段，复制一句原话并记录文件名/页段位置；在旁边写“它说明什么、不能说明什么、我还想问什么”各一句。今天不要求做完整文献综述。'
        output='证据定位表一行：来源／位置／原话／可支持内容／不能推出的结论／待问问题'
        why='时间短，先验证你能否把观点接到实际依据；这一步也能暴露你缺的是术语解释还是方法。'
        criteria=['一条原话能回到本人提供材料的具体位置。','把材料支持的内容与推测分开，不编造引文。','留下一条范围明确的待问问题，并说明这段材料为什么相关。']
    else:
        route='已有材料，做一次小范围对照再选问题'
        goal=f'围绕“{interest}”形成一张可讨论的研究问题卡'
        action='从现有材料中选两处与同一问题相关的内容，分别记原话和位置；填写“相同点、不同点、可能解释、目前证据缺口”，再把候选问题缩到一个对象和一个可比较现象。只有一处材料就保留第二处待补。'
        output='两行证据对照＋一个候选研究问题＋可行的下一步材料需求'
        why='先用实际材料检查问题是否具体、有证据可讨论，再决定阅读或研究方法，避免凭灵感反复换方向。'
        criteria=['两处材料位置可回查；不足两处明确缺项，不凑造对照。','问题限定对象和现象，解释仍标为可能解释。','下一步补什么证据具体可执行，没有把小样本当普遍结论。']
    return {'origin':'transparent_rule_candidate_not_model_diagnosis','route':route,'goal':goal,'action':action,'output':output,'why':why,'criteria':criteria,'minutes':minutes,'teaching_boundary':'给出结构与当前方法，不代写可提交论文，不生成研究数据；候选需本人确认。'}

