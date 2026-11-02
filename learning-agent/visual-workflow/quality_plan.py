"""Evidence-aware, transparent task scaffolding; never certifies a skill by self-report."""
METHODS={
'JN':('专利主张与凭证对应','先区分三个字段：申请是提出请求，授权是获得相应权利的主张，文件份数不等于专利数量；法律状态仍需具体凭证核对。','在P14只复制一条数量主张，填到“原句/类型/统计日/证书位置”一行；找不到字段写待核。'),
'XX':('原话到需求再到设计理由','原话是材料；需求是对原话的解释；产品决策需要说明为什么回应这个需求。不要把机构联系数量直接当成客户需求。','从一份已有访谈只圈一句用途或预算原话，记录位置，再写它支持哪一个产品选择；没有访谈先求助。'),
'YM':('收入与净收益同口径重算','销量×实收单价得到收入；收入减同期间成本才是净收益。亩产值不能直接替代每亩净收益，未售库存不能当实收。','只填一批次的面积、期间、销量、实收单价和凭证位置；缺项保持空白，不用宣传数字补齐。'),
'DS':('同批次比例与分母','回收量与投放量必须是同批次同单位。先写分子和分母含义，再计算；设计循环路径不能证明实际回收效果。','只登记一个真实批号及投放重量和凭证位置；缺记录列求助对象，不先算回收率。'),
'JR':('订单与实际结算区分','订单金额不一定已经到账。同规格同批次的实际结算减生产、包装、物流等成本，才可讨论净收益。','选一款菌类，填写规格、批号、结算凭证位置三格；缺凭证标未核，不先下利润结论。'),
'BC':('实现状态与节点证据','技术连通、机构合作、应用效果是不同主张。能运行一个节点也不能证明合作或效果成立。','选一个已有节点，先填入口和版本，提交一个合法测试输入并保存实际返回；没有入口先列环境缺项。'),
'SZ':('响应定义与效果基线','首次响应和办结是不同时间点；改善率需要同口径基线，不能用不同服务统计期直接比较。','只选一条脱敏服务请求，登记发起、首次响应、办结时间和日志位置；缺基线不填65%。'),
'WJ':('自身实现与状态变化','第三方试点不能证明自己已经实现。用自有原型的一次请求及前后状态判断能力，退款保留实际人工节点。','先确认自有原型入口；有入口只填测试车位、未来时段、初始状态和实际返回；无入口记录依赖。')}

def build_plan(project,state,tasks):
    ctx=state.get('context',{});pid=project['id'];skill,lesson,trial=METHODS[pid]
    criteria=state.get('criteria') or project['criteria']
    plan={'origin':'transparent_rules_on_human_curated_gaps_not_model_diagnosis','project':project['name'],
          'based_on_revision':state['revision'],'goal':ctx.get('goal',''),
          'target_quality':criteria,'source_locations':project['locations'],'candidate_gaps':project['gaps'],
          'gap_confirmation':'需对实际原文与本轮G确认；未自动宣称诊断成立',
          'capability_status':'unknown_not_inferred_from_self_report','current_skill':skill,
          'method_explanation':lesson,'minutes':min(ctx.get('minutes',20),20),
          'task_ids':[t['id'] for t in tasks if t.get('project')==pid and not t.get('scoped_complete')],
          'review_gate':'本人提交真实V2；非执行者按原G比较V1/V2，未过只补对应项',
          'transfer_gate':'在另一处真实材料减少提示再试；有实际复核才登记当前方法，不推断整体能力',
          'context_to_keep':['材料版本与位置','本轮目标与G','已经试过的方法','实际产物与反馈','未知与剩余差距']}
    review=state.get('review') or {}
    if not ctx or not state.get('frozen'):
        route='confirm_target';action='先结合当前作品确认一个质量差异：'+project['gaps'][0]+'；请说明为什么这项重要，并确认一条可检查判据，再安排执行。'
        why='想达到好水平是长期愿望，尚未确认本轮什么算好。';output='本人确认的本轮质量判据，不把抽象愿望当执行任务'
    elif any(x in ctx.get('materials','') for x in ('没有','缺少','未取得','无附件')):
        route='resolve_resource';action='在'+project['name']+'缺项卡写清缺哪份原件/凭证、它支撑哪条判据、向谁索取；确认没有替代材料时，暂停这项并切到已就绪差距。'
        why='资源缺失不能归因为能力不足；先核依赖，不安排空转练习。';output='一条可转交求助的缺项记录'
    elif review and not review.get('passed'):
        failed=[criteria[i] for i,x in enumerate(review.get('checks',[])) if not x['passed'] and i<len(criteria)]
        route='repair_failed_criterion';action='保留已通过项，只修改：'+'；'.join(failed)+'。对照复核指出的位置，留下修改前后及理由；仍用原判据复核。'
        why='已存在实际复核反馈，不能让学生重新从头做整套任务。';output='未过项的V2修订及对应差异'
    elif state.get('help',{}).get('category')=='method':
        route='teach_current_method';action=lesson+' 现在只试：'+trial
        why='实际卡点指向当前方法，先解释这一点，再用一行产物验证帮助是否有效。';output='一行试做＋本人解释为何这样做'
    elif state.get('stage')=='accepted':
        route='transfer_before_skill_claim';action='请自己解释这次为什么改得更符合原判据，再选另一处真实材料复用“'+skill+'”。只登记新的位置、产物和实际复核；不要复制上一条答案。'
        why='本次成果通过不代表已经独立掌握，下一步检验方法迁移。';output='另一处实际试做＋解释＋非执行者复核'
        plan['capability_status']='current_artifact_passed_transfer_pending'
    else:
        route='grounded_micro_trial';action=trial
        why='当前没有可靠能力证据；先用本项目一行试做定位缺口，不默认学生什么都不会。';output='可回查的一行试做，不是整份作品重写'
    plan.update(route=route,first_action=action,why=why,output=output)
    return plan

