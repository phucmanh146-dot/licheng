import unittest
import team_ai


class QuoteCatalogTests(unittest.TestCase):
    def docs(self, version=1):
        return [{'artifact_id':'A','artifact_version':version,
                 'units':[{'locator':'line:1','text':'原件slide:14：当前有1项发明专利，统计日待核。'}]}]

    def test_selection_expands_to_exact_current_source(self):
        row=team_ai.quote_catalog(self.docs())[0]
        ref=team_ai.resolve_quote_refs([{'quote_id':row['quote_id']}],self.docs())[0]
        self.assertEqual(ref['quote'],self.docs()[0]['units'][0]['text'])
        self.assertEqual(ref['locator'],'line:1')
        self.assertEqual(ref['quote_origin'],'server_catalog_selected_by_model')

    def test_old_version_and_unknown_ids_fail(self):
        old=team_ai.quote_catalog(self.docs())[0]['quote_id']
        for ref,docs in [({'quote_id':old},self.docs(2)),({'quote_id':'made-up'},self.docs())]:
            with self.assertRaises(ValueError):team_ai.resolve_quote_refs([ref],docs)

    def test_conflicting_quote_is_not_silently_corrected(self):
        row=team_ai.quote_catalog(self.docs())[0]
        for extra in [{'quote':'变成2项'}, {'locator':'slide:14'}, {'artifact_id':'other'}]:
            with self.assertRaises(ValueError):
                team_ai.resolve_quote_refs([{'quote_id':row['quote_id'],**extra}],self.docs())

    def test_legacy_quote_path_is_preserved_for_existing_validation(self):
        ref={'artifact_id':'A','artifact_version':1,'locator':'line:1','quote':'原件slide:14'}
        self.assertEqual(team_ai.resolve_quote_refs([ref],self.docs()),[ref])
