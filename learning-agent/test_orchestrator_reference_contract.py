import unittest
import team_orchestrator as team

class ReferenceContractTests(unittest.TestCase):
    def test_current_material_only_does_not_need_extract_pattern(self):
        gap = {'source_refs':['material:report:1'], 'extract_pattern':''}
        refs = team.require_extract_pattern_for_references(gap, [{'source_id':'material:report:1','kind':'user_material'}])
        self.assertEqual(len(refs), 1)
    def test_external_reference_requires_extract_pattern(self):
        gap = {'source_refs':['S1'], 'extract_pattern':'transfer the scoring method'}
        refs = team.require_extract_pattern_for_references(gap, [{'source_id':'S1','kind':'reference'}])
        self.assertEqual(len(refs), 1)
        with self.assertRaises(ValueError):
            team.require_extract_pattern_for_references({'source_refs':['S1'],'extract_pattern':''}, [{'source_id':'S1','kind':'reference'}])

if __name__ == '__main__': unittest.main()
