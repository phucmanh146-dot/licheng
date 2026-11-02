"""Real local Qdrant with explicitly synthetic vectors, not semantic quality."""
import os
import tempfile
import unittest
from unittest.mock import patch
import semantic_retrieval as sr


class SemanticBoundaryTests(unittest.TestCase):
    def test_qdrant_project_version_and_cache_identity(self):
        from qdrant_client import QdrantClient
        db = QdrantClient(':memory:')
        env = {'SHANGAN_OLLAMA_URL':'http://synthetic.invalid','SHANGAN_EMBEDDING_DIMENSIONS':'3','SHANGAN_QDRANT_PATH':'unused'}
        def row(version,text):
            return ({'artifact_id':'a','artifact_version':version,'sha256':str(version)*64},{'locator':'line:1','text':text},{})
        with patch.dict(os.environ,env),patch.object(sr,'client',return_value=db),patch.object(sr,'embed',side_effect=lambda texts:[[1.0,0.0,0.0] for _ in texts]):
            hits,trace=sr.search({'project_id':'p1'},[row(1,'old')],'query')
            self.assertEqual(trace['status'],'AVAILABLE');self.assertEqual(len(hits),1)
            hits,trace=sr.search({'project_id':'p2'},[],'query')
            self.assertEqual(hits,[])
            hits,trace=sr.search({'project_id':'p1'},[row(2,'new')],'query')
            self.assertTrue(all(d['artifact_version']==2 for _,d,u in hits))
        db.close()

    def test_dimension_and_nonfinite_rejected(self):
        import httpx
        with patch.dict(os.environ,{'SHANGAN_OLLAMA_URL':'http://synthetic.invalid','SHANGAN_EMBEDDING_DIMENSIONS':'3'}):
            response=httpx.Response(200,json={'embeddings':[[1,2]]},request=httpx.Request('POST','http://synthetic.invalid'))
            with patch('httpx.Client.post',return_value=response):
                with self.assertRaises(ValueError):sr.embed(['test'])


if __name__=='__main__':unittest.main()
