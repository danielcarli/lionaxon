# A small IFC model for the tests of the IFC import (LionAxon): a theatre in millimetres, with three
# storeys, walls, slabs with a courtyard, a mass for the fly tower, rooms with names, and phases
# written as an authoring tool exports them (properties "Phase Created" / "Phase Demolished").
# Needs IfcOpenShell:  pip install ifcopenshell   then   python3 tools/fixtures/make-ifc.py
import os
import ifcopenshell
import ifcopenshell.api as api
import ifcopenshell.api.root, ifcopenshell.api.unit, ifcopenshell.api.context, ifcopenshell.api.project
import ifcopenshell.api.aggregate, ifcopenshell.api.spatial, ifcopenshell.api.geometry, ifcopenshell.api.pset

f = api.run('project.create_file', version='IFC4')
project = api.run('root.create_entity', f, ifc_class='IfcProject', name='Teatro de teste')
api.run('unit.assign_unit', f, length={'is_metric': True, 'raw': 'MILLIMETERS'})
model = api.run('context.add_context', f, context_type='Model')
body = api.run('context.add_context', f, context_type='Model', context_identifier='Body', target_view='MODEL_VIEW', parent=model)
site = api.run('root.create_entity', f, ifc_class='IfcSite', name='Terreno')
building = api.run('root.create_entity', f, ifc_class='IfcBuilding', name='Teatro')
api.run('aggregate.assign_object', f, relating_object=project, products=[site])
api.run('aggregate.assign_object', f, relating_object=site, products=[building])

def storey(name, elev):
    s = api.run('root.create_entity', f, ifc_class='IfcBuildingStorey', name=name)
    s.Elevation = elev
    api.run('aggregate.assign_object', f, relating_object=building, products=[s])
    api.run('geometry.edit_object_placement', f, product=s, matrix=[[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, elev], [0, 0, 0, 1]], is_si=False)
    return s

ground = storey('Térreo', 0.0)
upper = storey('Superior', 4000.0)
roof = storey('Cobertura', 8000.0)

def place(el, x, y, z):
    api.run('geometry.edit_object_placement', f, product=el, matrix=[[1, 0, 0, x], [0, 1, 0, y], [0, 0, 1, z], [0, 0, 0, 1]], is_si=False)

def extrusion(points, height):
    pts = [f.createIfcCartesianPoint((float(x), float(y))) for x, y in points + [points[0]]]
    profile = f.createIfcArbitraryClosedProfileDef('AREA', None, f.createIfcPolyline(pts))
    solid = f.createIfcExtrudedAreaSolid(profile, f.createIfcAxis2Placement3D(f.createIfcCartesianPoint((0.0, 0.0, 0.0))), f.createIfcDirection((0.0, 0.0, 1.0)), float(height))
    return f.createIfcShapeRepresentation(body, 'Body', 'SweptSolid', [solid])

def element(cls, name, st, points, height, z, phase='New Construction', demolished=None, long_name=None):
    el = api.run('root.create_entity', f, ifc_class=cls, name=name)
    if long_name: el.LongName = long_name
    place(el, 0, 0, z)
    api.run('geometry.assign_representation', f, product=el, representation=extrusion(points, height))
    if cls == 'IfcSpace':
        api.run('aggregate.assign_object', f, relating_object=st, products=[el])
    else:
        api.run('spatial.assign_container', f, relating_structure=st, products=[el])
    props = {'Phase Created': phase}
    if demolished: props['Phase Demolished'] = demolished
    pset = api.run('pset.add_pset', f, product=el, name='Phasing')
    api.run('pset.edit_pset', f, pset=pset, properties=props)
    return el

def rect(x0, y0, x1, y1): return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]

# ground floor: an L-shaped slab around a courtyard, four walls, the rooms
element('IfcSlab', 'Laje térreo', ground, [(0, 0), (40000, 0), (40000, 30000), (0, 30000)], 200, -200)
for i, r in enumerate([rect(0, 0, 40000, 300), rect(0, 29700, 40000, 30000), rect(0, 0, 300, 30000), rect(39700, 0, 40000, 30000)]):
    element('IfcWall', f'Parede {i + 1}', ground, r, 4000, 0)
element('IfcSpace', '01', ground, rect(300, 300, 14000, 29700), 3800, 0, long_name='Foyer')
element('IfcSpace', '02', ground, rect(14000, 300, 30000, 29700), 3800, 0, long_name='Auditório')
element('IfcSpace', '03', ground, rect(30000, 300, 39700, 29700), 3800, 0, long_name='Palco')
# upper floor: a slab with a courtyard (a hole), walls only on the outside of the auditorium bar
slab = element('IfcSlab', 'Laje superior', upper, rect(14000, 0, 40000, 30000), 200, 4000 - 200)
element('IfcWall', 'Parede superior', upper, rect(14000, 0, 40000, 300), 4000, 4000)
element('IfcWall', 'Parede superior 2', upper, rect(14000, 29700, 40000, 30000), 4000, 4000)
element('IfcSpace', '11', upper, rect(14000, 300, 30000, 29700), 3800, 4000, long_name='Auditório')
# the fly tower: a mass over the stage, 16 m high from the upper floor
element('IfcBuildingElementProxy', 'Torre de cena', upper, rect(30000, 5000, 40000, 25000), 12000, 4000)
# the roof storey: a roof over the auditorium bar
element('IfcRoof', 'Cobertura', roof, rect(14000, 0, 30000, 30000), 300, 8000)
# an old shed, there before and taken down for the new building
element('IfcBuildingElementProxy', 'Galpão existente', ground, rect(-15000, 5000, -3000, 20000), 5000, 0, phase='Existing', demolished='New Construction')

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'theatre.ifc')
f.write(out)
print(out)

# ---- a harder one, as real models are: far from the origin, walls at odd angles, a round wall in many
# short pieces, points a hair apart, a slab with a courtyard, and many elements on one storey
import math
f = api.run('project.create_file', version='IFC4')
project = api.run('root.create_entity', f, ifc_class='IfcProject', name='Bloco irregular')
api.run('unit.assign_unit', f, length={'is_metric': True, 'raw': 'MILLIMETERS'})
model = api.run('context.add_context', f, context_type='Model')
body = api.run('context.add_context', f, context_type='Model', context_identifier='Body', target_view='MODEL_VIEW', parent=model)
site = api.run('root.create_entity', f, ifc_class='IfcSite', name='Terreno')
building = api.run('root.create_entity', f, ifc_class='IfcBuilding', name='Bloco')
api.run('aggregate.assign_object', f, relating_object=project, products=[site])
api.run('aggregate.assign_object', f, relating_object=site, products=[building])
X0, Y0 = 74653.0, -87296.0  # far from the origin, as in the file that failed first
g0 = storey('Térreo', 0.0)
g1 = storey('1º pavimento', 3500.0)

def wall_between(st, p, q, t, h, z, name):
    dx, dy = q[0] - p[0], q[1] - p[1]
    L = math.hypot(dx, dy)
    nx, ny = -dy / L * t / 2, dx / L * t / 2
    pts = [(p[0] + nx, p[1] + ny), (q[0] + nx, q[1] + ny), (q[0] - nx, q[1] - ny), (p[0] - nx, p[1] - ny)]
    return element('IfcWall', name, st, [(X0 + x, Y0 + y) for x, y in pts], h, z)

# an irregular outline: walls at 17° and a round end of 48 pieces, each a hair off the next
outline = [(0, 0), (30000, 0), (30000 + 12000 * math.cos(math.radians(17)), 12000 * math.sin(math.radians(17)))]
cx, cy, r = 20000, 18000, 14000
for k in range(49):
    a = math.radians(-20 + 220 * k / 48)
    outline.append((cx + r * math.cos(a) + (k % 3) * 1e-6, cy + r * math.sin(a) - (k % 2) * 1e-6))
outline.append((0, 18000))
for st, z in [(g0, 0.0), (g1, 3500.0)]:
    for k in range(len(outline)):
        wall_between(st, outline[k], outline[(k + 1) % len(outline)], 250, 3500, z, f'Parede {k}')
    # the slab: the same outline, with a courtyard (a hole)
    pts = [f.createIfcCartesianPoint((X0 + x, Y0 + y)) for x, y in outline + [outline[0]]]
    hole = [(10000, 4000), (16000, 4000), (16000, 10000), (10000, 10000)]
    hpts = [f.createIfcCartesianPoint((X0 + x, Y0 + y)) for x, y in hole + [hole[0]]]
    profile = f.createIfcArbitraryProfileDefWithVoids('AREA', None, f.createIfcPolyline(pts), [f.createIfcPolyline(hpts)])
    solid = f.createIfcExtrudedAreaSolid(profile, f.createIfcAxis2Placement3D(f.createIfcCartesianPoint((0.0, 0.0, 0.0))), f.createIfcDirection((0.0, 0.0, 1.0)), 200.0)
    slab = api.run('root.create_entity', f, ifc_class='IfcSlab', name='Laje')
    place(slab, 0, 0, z - 200)
    api.run('geometry.assign_representation', f, product=slab, representation=f.createIfcShapeRepresentation(body, 'Body', 'SweptSolid', [solid]))
    api.run('spatial.assign_container', f, relating_structure=st, products=[slab])
# many columns on the ground floor
for i in range(12):
    for j in range(6):
        element('IfcColumn', f'Pilar {i}-{j}', g0, [(X0 + 2000 + i * 2200 + x, Y0 + 1500 + j * 2200 + y) for x, y in rect(0, 0, 300, 300)], 3500, 0)
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'irregular.ifc')
f.write(out)
print(out)
