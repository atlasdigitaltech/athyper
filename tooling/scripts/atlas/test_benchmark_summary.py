import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('summary',Path(__file__).with_name('summarize-benchmark.py'))
summary=importlib.util.module_from_spec(spec);spec.loader.exec_module(summary)


class BenchmarkSummaryTests(unittest.TestCase):
    def test_nearest_rank(self):
        self.assertEqual(summary.percentile(list(range(1,31)),.95),29)
        self.assertEqual(summary.percentile([None,9,1],.95),9)
        self.assertIsNone(summary.percentile([],.95))

    def test_failures_are_not_successes_or_latency_samples(self):
        values=[{'ok':True,'qualityPassed':True,'ttftMs':40,'totalMs':400,'throughput':50,'terminal':{'eval_count':20}},
                {'ok':False,'qualityPassed':False,'ttftMs':None,'totalMs':5000}]
        result=summary.metrics(values)
        self.assertEqual(result['requests'],2)
        self.assertEqual(result['successful'],1)
        self.assertEqual(result['qualityPassed'],1)
        self.assertEqual(result['ttftP95Ms'],40)
        self.assertEqual(result['medianOutputTokensPerSecond'],50)


if __name__=='__main__':unittest.main()
