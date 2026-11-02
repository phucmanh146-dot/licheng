"""Evaluate actual retrieval against user-supplied human annotations.

Input: {human_labeled:true, cases:[{project_id,query,expected:[{artifact_id,
artifact_version,locator}]}]}. This CLI never generates its own ground truth.
"""
import argparse
import json
import artifact_retrieval
import team_orchestrator as team


def evaluate(dataset):
    if dataset.get('human_labeled') is not True or len(dataset.get('cases',[])) < 30:
        raise ValueError('验收需至少30条人工标注问题；不自动生成答案冒充标注')
    results = []
    def key(row):
        return (row['artifact_id'],row['artifact_version'],row['locator'])
    for case in dataset['cases']:
        expected = {key(x) for x in case['expected']}
        if not expected:
            raise ValueError('每题需明确人工确认的相关位置')
        p = team.state(case['project_id'])
        value = artifact_retrieval.select(p,case['query'],limit=5)
        actual = {key(x) for x in value['hits']}
        for hit in value['hits']:
            import artifact_store
            artifact_store.references(p,[{**hit,'quote':hit['text']}])
        results.append({'query':case['query'],'recall_at_5':len(actual&expected)/len(expected),
                        'trace':value})
    recall = sum(r['recall_at_5'] for r in results)/len(results)
    return {'cases':results,'mean_recall_at_5':recall,'target':0.85,'passed':recall>=0.85,
            'note':'内部工程目标；引用可回查不等于语义支持性或官方比赛得分'}


if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('annotations');args=parser.parse_args()
    with open(args.annotations,encoding='utf-8') as source:
        print(json.dumps(evaluate(json.load(source)),ensure_ascii=False,indent=2))
