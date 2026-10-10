package runner

import (
	"strings"
	"testing"
)

func TestAutomaticContainerKindsAndSafePriorityQueues(t *testing.T) {
	res := newRunner(t).Run(`#include <bits/stdc++.h>
using namespace std;
struct Compare { static int calls; bool operator()(int a,int b) const { ++calls; return a < b; } };
int Compare::calls=0;
int main() {
 multiset<int> repeated{2,2,3};
 unordered_multimap<int,int> mapping{{1,2},{1,3}};
 queue<pair<int,int>> pending; pending.push({4,5});
 stack<pair<int,int>> history; history.push({6,7});
 priority_queue<pair<int,int>,vector<pair<int,int>>,greater<pair<int,int>>> heap;
 heap.push({3,4}); heap.push({1,2});
 priority_queue<int,vector<int>,Compare> custom; custom.push(2); custom.push(1);
 int before=Compare::calls;
 int observe_again=1;
 cout << (before==Compare::calls) << ':' << heap.top().first;
}`, "")
	if !res.Success || res.TraceMode != "automatic" || res.Output != "1:1" {
		t.Fatalf("result: mode=%s output=%q errors=%s", res.TraceMode, res.Output, res.Errors)
	}
	for _, tc := range []struct {
		name, kind string
		size       int
	}{
		{"repeated", "multiset", 3}, {"mapping", "unordered_multimap", 2},
		{"pending", "queue", 1}, {"history", "stack", 1}, {"heap", "priority_queue", 2},
	} {
		found := false
		for _, step := range res.Steps {
			found = found || step.Data["name"] == tc.name && step.Data["kind"] == tc.kind && step.Data["size"] == float64(tc.size)
		}
		if !found {
			t.Errorf("metadata absent for %s", tc.name)
		}
	}
	if !hasStructureItems(res, "pending", "(4, 5)") || !hasStructureItems(res, "history", "(6, 7)") || !hasStructureItems(res, "heap", "(1, 2)", "(3, 4)") {
		t.Fatal("pair adapters were not expanded in removal order")
	}
}

func TestAutomaticExactWideIntegersAndTruncation(t *testing.T) {
	res := newRunner(t).Run(`#include <bits/stdc++.h>
using namespace std;
int main() {
 __int128 large=(static_cast<__int128>(1)<<100)+123;
 vector<__int128> values{large};
 vector<long long> numbers{9007199254740993LL};
 numbers[0]=9007199254740995LL;
 vector<int> many(300,1);
 cout << "ok";
}`, "")
	if !res.Success || res.TraceMode != "automatic" || res.Output != "ok" {
		t.Fatalf("%+v", res)
	}
	wide, changed, omitted := false, false, false
	for _, step := range res.Steps {
		if step.Data["name"] == "values" && step.StepEvent == "VECTOR_INIT" {
			labels, _ := step.Data["value_labels"].([]any)
			wide = len(labels) == 1 && labels[0] == "1267650600228229401496703205499"
		}
		changed = changed || step.Data["name"] == "numbers" && step.StepEvent == "VECTOR_SET" && step.Data["value_label"] == "9007199254740995"
		omitted = omitted || step.Data["name"] == "many" && step.StepEvent == "VECTOR_META" && step.Data["size"] == float64(300) && step.Data["truncated"] == float64(44)
	}
	if !wide || !changed || !omitted {
		t.Fatalf("wide=%v changed=%v omitted=%v", wide, changed, omitted)
	}
}

func TestAutomaticMatrixDependenciesAndSingleIndexEvaluation(t *testing.T) {
	res := newRunner(t).Run(`#include <bits/stdc++.h>
using namespace std;
int main() {
 vector<vector<int>> dp{{1,2},{3,0}};
 dp[1][1]=dp[0][1]+dp[1][0];
 int i=0,j=0;
 dp[i++][j++]=9;
 cout << dp[0][0] << ':' << i << ':' << j << ':' << dp[1][1];
}`, "")
	if !res.Success || res.TraceMode != "automatic" || res.Output != "9:1:1:5" {
		t.Fatalf("%+v", res)
	}
	dependency := false
	for _, step := range res.Steps {
		if step.StepEvent == "MATRIX_ACCESS" && step.Data["access"] == "write" && step.Data["row"] == float64(1) && step.Data["col"] == float64(1) {
			deps, _ := step.Data["dependencies"].([]any)
			dependency = len(deps) == 2
		}
	}
	if !dependency {
		t.Fatal("DP write did not retain the two evaluated input cells")
	}
}

func TestAutomaticUninitializedAndRecursiveCallIdentity(t *testing.T) {
	res := newRunner(t).Run(`#include <bits/stdc++.h>
using namespace std;
int visit(int n) {
 vector<int> state{n};
 if(n==0) return 0;
 int result=visit(n-1);
 return result+state[0];
}
int main() {
 int unknown;
 vector<int> state{99},empty;
 cout << visit(2) << ':' << state[0];
}`, "")
	if !res.Success || res.TraceMode != "automatic" || res.Output != "3:99" {
		t.Fatalf("%+v", res)
	}
	unknown, depth, restored := false, false, false
	ids := map[float64]bool{}
	for _, step := range res.Steps {
		unknown = unknown || step.StepEvent == "UNINITIALIZED" && step.Data["name"] == "unknown" && step.Data["initialized"] == false
		if step.StepEvent == "CALL_ENTER" {
			id, _ := step.Data["id"].(float64)
			if ids[id] {
				t.Fatal("call ID reused")
			}
			ids[id] = true
			depth = depth || step.Data["depth"] == float64(4)
		}
		if step.StepEvent == "VECTOR_INIT" && step.Data["name"] == "state" {
			values, _ := step.Data["values"].([]any)
			restored = restored || len(values) == 1 && values[0] == float64(99)
		}
		if step.StepEvent == "SET_STRUCT" && step.Data["name"] == "Variáveis" {
			for _, item := range step.Data["items"].([]any) {
				if strings.HasPrefix(item.(string), "unknown =") {
					t.Fatal("read unknown scalar")
				}
			}
		}
	}
	if !unknown || !depth || !restored {
		t.Fatalf("unknown=%v depth=%v restored=%v", unknown, depth, restored)
	}
}
