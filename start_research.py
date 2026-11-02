"""Start the local research workflow from a fresh repository clone."""
from pathlib import Path
import runpy,sys
root=Path(__file__).resolve().parent
app=root/'learning-agent/visual-workflow'
sys.path.insert(0,str(app))
sys.argv=[str(app/'server.py'),'--workspace',str(root),*sys.argv[1:]]
runpy.run_path(str(app/'server.py'),run_name='__main__')
