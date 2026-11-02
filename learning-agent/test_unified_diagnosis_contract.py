import copy
import unittest
import team_ai


class UnifiedContractTests(unittest.TestCase):
    def test_extraction_with_leading_words_still_needs_observable_output(self):
        for action in ['从原文中提取专利数量、类型、日期和申请授权口径。',
                       '从原文中提取与产品/授权/样品相关的具体信息。',
                       '分析项目描述中的滴灌系统运行和回收机制。']:
            with self.subTest(action=action),self.assertRaises(ValueError):
                team_ai.validate_action_specificity({'action':action})
        team_ai.validate_action_specificity({'action':'从P14提取数量，填入专利核对表第一行并记录统计日'})

    def test_omitted_coordinates_bind_only_to_unique_selected_source(self):
        ref={'artifact_id':'A','artifact_version':3,'locator':'line:9',
             'quote_origin':'server_catalog_selected_by_model'}
        g={'evidence_refs':[ref]}
        team_ai.bind_selected_location(g)
        self.assertEqual(g['current_locator'],'line:9')
        self.assertEqual(g['current_artifact']['artifact_version'],3)
        wrong={'evidence_refs':[ref],'current_locator':'slide:9'}
        team_ai.bind_selected_location(wrong)
        self.assertEqual(wrong['current_locator'],'slide:9')
        ambiguous={'evidence_refs':[ref,{**ref,'locator':'line:10'}]}
        team_ai.bind_selected_location(ambiguous)
        self.assertNotIn('current_locator',ambiguous)

    def test_diagnosis_contract_does_not_seed_first_quote_into_every_gap(self):
        payload={'stage':'diagnosis','documents':[{'artifact_id':'new','artifact_version':7,
            'units':[{'locator':'line:3','text':'现有数据为1项，原始凭证待核。'}]}],
            'member_profiles':[{'member_id':'student'}],
            'output_contract':{'gaps':[{'evidence_refs':[{'quote':'原文引文'}],
                'micro_steps':[{'input_version':{'artifact_id':'输入ID','artifact_version':1}}]},
                {'evidence_refs':[{'quote':'另一个原文引文'}], 'micro_steps':[{}]}]}}
        before=copy.deepcopy(payload)
        result=team_ai.prepare_output_contract(payload)['gaps']
        self.assertEqual(len(result),2)
        for gap in result:
            self.assertEqual(gap['evidence_refs'],[])
            self.assertEqual(gap['current_locator'],'')
            self.assertEqual(gap['current_artifact'],{'artifact_id':'','artifact_version':0})
            self.assertEqual(gap['micro_steps'][0]['input_version'],{'artifact_id':'','artifact_version':0})
        self.assertEqual(payload,before)

    def test_review_contract_keeps_existing_schema(self):
        payload={'stage':'review','output_contract':{'note':'说明','root_fields':['note']}}
        self.assertEqual(team_ai.prepare_output_contract(payload),payload['output_contract'])

    def test_observed_placeholder_copying_is_rejected(self):
        valid={'current_evidence':'P14写1项发明、6项实用新型；尚缺当前凭证映射',
               'target_result':'一行证书映射','reason':'跨页统计日待核','priority_reason':'先统一两页口径'}
        team_ai.validate_diagnosis_content(valid)
        for key,value in [('current_evidence','当前事实'),('priority_reason','依据'),('reason','理由')]:
            with self.subTest(key=key),self.assertRaises(ValueError):
                team_ai.validate_diagnosis_content({**valid,key:value})


    def test_quote_catalog_accepts_bare_model_quote_ids(self):
        docs = [{'artifact_id':'report','artifact_version':1,'units':[{'locator':'line:1','text':'A grounded source quote'}]}]
        catalog = team_ai.quote_catalog(docs)
        resolved = team_ai.resolve_quote_refs([catalog[0]['quote_id']], docs)
        self.assertEqual(resolved[0]['quote'], 'A grounded source quote')
        self.assertEqual(resolved[0]['quote_origin'], 'server_catalog_selected_by_model')


    def test_extract_pattern_required_only_for_reference_sources(self):
        gap = {'source_refs':['material:report:1'], 'extract_pattern':''}
        self.assertEqual(team_ai.validate_extract_pattern(gap, {'material:report:1':{'kind':'user_material'}}), '')
        ref_gap = {'source_refs':['S1'], 'extract_pattern':'transfer the comparison rubric, not source wording'}
        self.assertTrue(team_ai.validate_extract_pattern(ref_gap, {'S1':{'kind':'reference'}}))
        with self.assertRaises(ValueError):
            team_ai.validate_extract_pattern({'source_refs':['S1'], 'extract_pattern':''}, {'S1':{'kind':'reference'}})


    def test_micro_steps_bind_their_input_artifact_source(self):
        gap = {'micro_steps':[{'input_version':{'artifact_id':'data','artifact_version':2},'source_refs':['material:report:1']}]}
        refs = {'material:data:2':{'kind':'user_material'},'material:report:1':{'kind':'user_material'}}
        team_ai.bind_micro_step_input_sources(gap, refs)
        self.assertEqual(set(gap['micro_steps'][0]['source_refs']), {'material:data:2','material:report:1'})
        with self.assertRaises(ValueError):
            team_ai.bind_micro_step_input_sources({'micro_steps':[{'input_version':{'artifact_id':'missing','artifact_version':1}}]}, refs)

