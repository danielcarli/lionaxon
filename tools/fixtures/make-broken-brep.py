# The IFC file of a test: a wall made as a brep whose top and bottom faces cannot be triangulated (all
# their points on one line), as curved or broken faces of real models are. Needs IfcOpenShell.
import ifcopenshell, ifcopenshell.guid
f = ifcopenshell.file(schema='IFC4')
G = ifcopenshell.guid.new
P3 = lambda x, y, z: f.createIfcCartesianPoint((float(x), float(y), float(z)))
origin = f.createIfcAxis2Placement3D(P3(0, 0, 0))
ctx = f.createIfcGeometricRepresentationContext(None, 'Model', 3, 1e-5, origin, None)
body = f.createIfcGeometricRepresentationSubContext('Body', 'Model', None, None, None, None, ctx, None, 'MODEL_VIEW', None)
units = f.createIfcUnitAssignment([f.createIfcSIUnit(None, 'LENGTHUNIT', None, 'METRE')])
proj = f.createIfcProject(G(), None, 'Brep', None, None, None, None, [ctx], units)
lp = f.createIfcLocalPlacement(None, origin)
site = f.createIfcSite(G(), None, 'Site', None, None, lp, None, None, 'ELEMENT', None, None, None, None, None)
bld = f.createIfcBuilding(G(), None, 'B', None, None, lp, None, None, 'ELEMENT', None, None, None)
st = f.createIfcBuildingStorey(G(), None, 'Térreo', None, None, lp, None, None, 'ELEMENT', 0.0)
f.createIfcRelAggregates(G(), None, None, None, proj, [site]); f.createIfcRelAggregates(G(), None, None, None, site, [bld]); f.createIfcRelAggregates(G(), None, None, None, bld, [st])
def face(pts):
    loop = f.createIfcPolyLoop([P3(*p) for p in pts])
    return f.createIfcFace([f.createIfcFaceOuterBound(loop, True)])
x0, y0, x1, y1, h = 0, 0, 10, 6, 4
sides = [face([(x0,y0,0),(x1,y0,0),(x1,y0,h),(x0,y0,h)]), face([(x1,y0,0),(x1,y1,0),(x1,y1,h),(x1,y0,h)]),
         face([(x1,y1,0),(x0,y1,0),(x0,y1,h),(x1,y1,h)]), face([(x0,y1,0),(x0,y0,0),(x0,y0,h),(x0,y1,h)])]
# top and bottom faces broken: all their points on one line (no plane to triangulate them on)
bad = [face([(x0,y0,h),(x1,y0,h),(x1*2,y0,h),(x1*3,y0,h)]), face([(x0,y0,0),(x1,y0,0),(x1*2,y0,0)])]
brep = f.createIfcFacetedBrep(f.createIfcClosedShell(sides + bad))
rep = f.createIfcProductDefinitionShape(None, None, [f.createIfcShapeRepresentation(body, 'Body', 'Brep', [brep])])
w = f.createIfcWall(G(), None, 'Wall with broken top', None, None, lp, rep, None, None)
f.createIfcRelContainedInSpatialStructure(G(), None, None, None, [w], st)
import os
f.write(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'broken-brep.ifc'))
