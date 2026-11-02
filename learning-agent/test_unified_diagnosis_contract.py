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

    def test_current_quote_ids_replace_conflicting_legacy_example(self):
        payload={'stage':'diagnosis','documents':[{'artifact_id':'new','artifact_version':7,
            'units':[{'locator':'line:3','text':'现有数据为1项，原始凭证待核。'}]}],
            'member_profiles':[{'member_id':'student'}],
            'output_contract':{'gaps':[{'evidence_refs':[{'quote':'原文引文'}],
                'micro_steps':[{'input_version':{'artifact_id':'输入ID','artifact_version':1}}]}]}}
        before=copy.deepcopy(payload)
        result=team_ai.prepare_output_contract(payload)['gaps'][0]
        ref=team_ai.resolve_quote_refs(result['evidence_refs'],payload['documents'])[0]
        self.assertEqual(ref['artifact_version'],7)
        self.assertEqual(result['current_locator'],'line:3')
        self.assertEqual(result['micro_steps'][0]['input_version']['artifact_id'],'new')
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

