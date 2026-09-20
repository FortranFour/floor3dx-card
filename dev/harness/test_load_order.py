"""Regression test: a Draco model must come out in the same object order on every load.

Draco meshes are decoded by a pool of workers and finish in a different order each time. GLTFLoader adds
each node to the scene when its mesh is ready, so without `restoreFileOrder` (src/model-loader.ts) the
object order, and the three.js ids the card's clone receives, change from load to load. three.js breaks
depth ties between transparent objects by id, and a model with baked vertices (every node at the origin)
ties all the time: coincident glass surfaces then swap at random.

    (cd tools && npm install)
    node tools/compress.mjs demo/demo.glb demo/demo           # writes demo/demo.draco.glb
    python3 dev/harness/test_load_order.py demo/demo.draco.glb
"""
import os, sys
from run import run

if len(sys.argv) < 2:
    sys.exit(__doc__)
folder, name = os.path.split(sys.argv[1])

JS = """()=>{const ids=[],names=[];window.card._scene.traverse(o=>{if(o.isMesh&&o.name){ids.push(o.id);names.push(o.name)}});
  let ascending=true;for(let i=1;i<ids.length;i++)if(ids[i]<ids[i-1])ascending=false;return {names,ascending}}"""

loads = []
for cores in (1, 8, 8, 8):  # 1 core = one decode worker = file order; 8 cores = four workers
    result, errors = run(f'path=/{folder}/&model={name}&cores={cores}', after=lambda page: page.evaluate(JS))
    loads.append(result)
    print(f'cores={cores}: {len(result["names"])} meshes, first: {", ".join(result["names"][:4])}', '| errors:', errors[:1])

same = all(load['names'] == loads[0]['names'] for load in loads)
print('PASS' if same else 'FAIL', '- object order is', 'identical on every load' if same else 'different between loads')
sys.exit(0 if same else 1)
