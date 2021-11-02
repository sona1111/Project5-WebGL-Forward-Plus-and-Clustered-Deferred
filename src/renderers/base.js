import TextureBuffer from './textureBuffer';
import {NUM_LIGHTS} from "../scene";
import {Frustum, Matrix4, Vector3, BufferGeometry, Face3, Vector2, Vector4, Sphere, Box3} from "three";
import {canvas, camera} from "../init";
import Wireframe from "../wireframe";
import {vec4, vec3} from 'gl-matrix';

export const MAX_LIGHTS_PER_CLUSTER = 100;

export default class BaseRenderer {
  constructor(xSlices, ySlices, zSlices) {
    // Create a texture to store cluster data. Each cluster stores the number of lights followed by the light indices
    this._clusterTexture = new TextureBuffer(xSlices * ySlices * zSlices, MAX_LIGHTS_PER_CLUSTER + 1);
    this._xSlices = xSlices;
    this._ySlices = ySlices;
    this._zSlices = zSlices;
    this._clusterMins = [];
    this._clusterMaxs = [];
    this._clusterAABB = [];
    this.assembleClusters(camera, canvas);
  }

  getNormalForTriangle(opposite) {
    let hypothenuse = Math.sqrt(1 + opposite * opposite);
    return [1 / hypothenuse, opposite / hypothenuse];
  }

  getDotForFrustumCheck(currentAxisDistance, camSpaceLightPos, axis) {
    // get the info for the frustum vector
    let normalCoords = this.getNormalForTriangle(currentAxisDistance);

    // flip the vector by around the cosine axis
    let normal;
    if (axis === "x") {
      // X plane
      normal = vec3.fromValues(normalCoords[0], 0, -normalCoords[1]);
    } else {
      // Y plane
      normal = vec3.fromValues(0, normalCoords[0], -normalCoords[1]);
    }


    // return the dot product of the frustum vector with the light position vector
    return vec3.dot(camSpaceLightPos, normal);
  }

  screen2View(screen, invProj){
    //console.log(camera.position)
    //Convert to NDC
    const texCoord = new Vector2(screen.x / canvas.width, screen.y / canvas.height);
    //console.log(screen)
    //console.log(texCoord)

    //Convert to clipSpace
    const clip = new Vector4((texCoord.x * 2.0) - 1.0, ((1.0 - texCoord.y) * 2.0) - 1.0, screen.z, screen.w);
    //console.log(clip);

    //console.log(inverseProjection)
    //View space transform
    let view = clip.applyMatrix4(invProj);
    //console.log(view);
    //Perspective projection
    view = view.divideScalar(view.w);
    //console.log(view);

    //throw 'oh no';


    return view;
  }

  lineIntersectionToZPlane(B, zDistance){
    //all clusters planes are aligned in the same z direction
    const normal = new Vector3(0.0, 0.0, 1.0);
    //getting the line from the eye to the tile

    const A = new Vector3(0, 0, 0);

    //const ab =  B.clone().sub(A);
    normal.dot(B)
    //console.log(normal, B, normal.dot(B))

    //Computing the intersection length for the line and the plane
    const t = zDistance  / normal.dot(B);
    //Computing the actual xyz position of the point along the line
    const result = A.clone().add(B.multiplyScalar(t));


    return result;
  }

  assembleClusters(_camera, _canvas){
    // needs to be called whenever updating camera FOV

    const tileSizePx = _canvas.width / this._xSlices;
    const tileSizePy = _canvas.height / this._ySlices;

    const zNear = _camera.near;
    const zFar = _camera.far;
    //console.log(_camera.projectionMatrixInverse.elements)

    this._clusterAABB = [];
    for (let z = 0; z < this._zSlices; ++z) {
      //if(z !== 10) continue;
      for (let y = 0; y < this._ySlices; ++y) {
        for (let x = 0; x < this._xSlices; ++x) {

          const eyePos = new Vector3(0.0, 0.0, 0.0);

          //Calculating the min and max point in screen space
          const maxPoint_sS = new Vector4((x + 1) * tileSizePx, (y + 1) * tileSizePy, -1.0, 1.0); // Top Right
          const minPoint_sS = new Vector4((x + 0) * tileSizePx, (y + 0) * tileSizePy, -1.0, 1.0); // Bottom Left


          //Pass min and max to view space


          const maxPoint_vSa = this.screen2View(maxPoint_sS, _camera.projectionMatrixInverse);
          const maxPoint_vS = new Vector3(maxPoint_vSa.x, maxPoint_vSa.y, maxPoint_vSa.z);
          const minPoint_vSa = this.screen2View(minPoint_sS, _camera.projectionMatrixInverse);
          const minPoint_vS = new Vector3(minPoint_vSa.x, minPoint_vSa.y, minPoint_vSa.z);

          //wireframe.addLineSegment([minPoint_vS.x, minPoint_vS.y, minPoint_vS.z], [maxPoint_vS.x, maxPoint_vS.y, maxPoint_vS.z], [1.0, 0.0, 0.0]);
          //wireframe.addLineSegment([minPoint_vS.x, minPoint_vS.y, minPoint_vS.z], [maxPoint_vS.x, maxPoint_vS.y, maxPoint_vS.z], [1.0, 0.0, 0.0]);

          //Near and far values of the cluster in view space
          //We use equation (2) directly to obtain the tile values
          const tileNear = -zNear * Math.pow(zFar / zNear, z / this._zSlices);
          const tileFar = -zNear * Math.pow(zFar / zNear, (z + 1) / this._zSlices);

          //Finding the 4 intersection points made from each point to the cluster near/far plane
          const minPointNear = this.lineIntersectionToZPlane(minPoint_vS, tileNear);
          const minPointFar = this.lineIntersectionToZPlane(minPoint_vS, tileFar);
          const maxPointNear = this.lineIntersectionToZPlane(maxPoint_vS, tileNear);
          const maxPointFar = this.lineIntersectionToZPlane(maxPoint_vS, tileFar);
          //throw 'oh no'

          const minPointAABB = new Vector3(
              Math.min(minPointNear.x, minPointFar.x, maxPointNear.x, maxPointFar.x),
              Math.min(minPointNear.y, minPointFar.y, maxPointNear.y, maxPointFar.y),
              Math.min(minPointNear.z, minPointFar.z, maxPointNear.z, maxPointFar.z),
          )

          const maxPointAABB = new Vector3(
              Math.max(maxPointNear.x, maxPointFar.x, maxPointNear.x, maxPointFar.x),
              Math.max(maxPointNear.y, maxPointFar.y, maxPointNear.y, maxPointFar.y),
              Math.max(maxPointNear.z, maxPointFar.z, maxPointNear.z, maxPointFar.z),
          )

          // console.log(minPointAABB)
          // console.log(maxPointAABB)
          //Saving the AABB at the tile linear index
          //Cluster is just a SSBO made of a struct of 2 vec4's
          // this._clusterMins[tile_index] = new Vector4(minPointAABB.x, minPointAABB.y, minPointAABB.z, 0.0);
          // this._clusterMaxs[tile_index] = new Vector4(maxPointAABB.x, maxPointAABB.y, maxPointAABB.z, 0.0);
          this._clusterAABB.push(new Box3(minPointAABB, maxPointAABB));

          // console.log(maxPoint_vS);
          // console.log(minPoint_vS);


          //minPointAABB.unproject(_camera);
          //maxPointAABB.unproject(_camera);

          //minPointAABB.multiplyScalar(-1)
          //maxPointAABB.multiplyScalar(-1)

          //minPointAABB.project(_camera)
          //maxPointAABB.project(_camera)


          // minPointAABB.applyAxisAngle( new Vector3( 1, 0, 0 ), _camera.rotation.x );
          // minPointAABB.applyAxisAngle( new Vector3( 0, 1, 0 ), _camera.rotation.y );
          // minPointAABB.applyAxisAngle( new Vector3( 0, 0, 1 ), _camera.rotation.z );
          //
          // maxPointAABB.applyAxisAngle( new Vector3( 1, 0, 0 ), _camera.rotation.x );
          // maxPointAABB.applyAxisAngle( new Vector3( 0, 1, 0 ), _camera.rotation.y );
          // maxPointAABB.applyAxisAngle( new Vector3( 0, 0, 1 ), _camera.rotation.z );
          //
          // minPointAABB.add(_camera.position)
          // maxPointAABB.add(_camera.position)

          //const color = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]][z % 3]
          //wireframe.addLineSegment([minPointAABB.x, minPointAABB.y, minPointAABB.z], [maxPointAABB.x, maxPointAABB.y, maxPointAABB.z], color);
          //
          // const aabb = new Box3()
          //
          // geometry.translation.set(campos.x, campos.y, campos.z)
          // geometry.rotation.set(camrot.x, camrot.y, camrot.z);
          //
          // consnole.log(geometry.edges)
          //throw 'oh no';
          //geometry.intersect()

          // if(frust.intersectsObject(geometry)){
          //
          // }
          // for(let i = 0; i < NUM_LIGHTS; ++i) {
          //   const light = scene.lights[i];
          //
          //
          // }

        }
      }
    }



  }

  rad(degrees){
    return degrees * (Math.PI/180);
  }


  updateClusters(camera, viewMatrix, scene) {


    // const projMat = new Matrix4();
    // projMat.elements = viewMatrix;
    // const frust = new Frustum()
    // frust.setFromProjectionMatrix(projMat)
    // console.log(frust);

    // TODO: Update the cluster texture with the count and indices of the lights in each cluster
    // This will take some time. The math is nontrivial...

    const heightMultiplier = 2.0 * Math.tan(this.rad(camera.fov / 2));
    const xSliceSize = heightMultiplier * camera.aspect / this._xSlices;
    const ySliceSize = heightMultiplier / this._ySlices;
    const zMultiplier = camera.far - camera.near;
    const zSliceSize = zMultiplier / this._zSlices;
    const campos = camera.position;
    const camrot = camera.rotation;

    for (let z = 0; z < this._zSlices; ++z) {
      for (let y = 0; y < this._ySlices; ++y) {
        for (let x = 0; x < this._xSlices; ++x) {
          let i = x + y * this._xSlices + z * this._xSlices * this._ySlices;
          // Reset the light count to 0 for every cluster
          this._clusterTexture.buffer[this._clusterTexture.bufferIndex(i, 0)] = 0;
        }
      }
    }

    for (let z = 0; z < this._zSlices; ++z) {
      for (let y = 0; y < this._ySlices; ++y) {
        for (let x = 0; x < this._xSlices; ++x) {
          let i = x + y * this._xSlices + z * this._xSlices * this._ySlices;
          // Reset the light count to 0 for every cluster


          // var geometry = new Geometry();
          //
          // geometry.vertices = [
          //   new Vector3( (x+0)*xSliceSize, (y+0)*ySliceSize, (z+0)*zSliceSize ),
          //   new Vector3( (x+1)*xSliceSize, (y+0)*ySliceSize, (z+0)*zSliceSize ),
          //   new Vector3( (x+1)*xSliceSize, (y+1)*ySliceSize, (z+0)*zSliceSize ),
          //   new Vector3( (x+0)*xSliceSize, (y+1)*ySliceSize, (z+0)*zSliceSize ),
          //   new Vector3( (x+0)*xSliceSize, (y+0)*ySliceSize, (z+1)*zSliceSize ),
          //   new Vector3( (x+1)*xSliceSize, (y+0)*ySliceSize, (z+1)*zSliceSize ),
          //   new Vector3( (x+1)*xSliceSize, (y+1)*ySliceSize, (z+1)*zSliceSize ),
          //   new Vector3( (x+0)*xSliceSize, (y+1)*ySliceSize, (z+1)*zSliceSize )
          // ];
          //
          // geometry.faces = [
          //   new Face3( 0, 1, 2 ),
          //   new Face3( 1, 2, 3 ),
          //
          //   new Face3( 1, 5, 3 ),
          //   new Face3( 5, 3, 7 ),
          //
          //   new Face3( 0, 4, 6 ),
          //   new Face3( 6, 2, 0 ),
          //
          //   new Face3( 2, 6, 3 ),
          //   new Face3( 7, 6, 3 ),
          //
          //   new Face3( 7, 6, 5 ),
          //   new Face3( 5, 6, 4 ),
          //
          //   new Face3( 0, 1, 4 ),
          //   new Face3( 4, 1, 5 ),
          // ];
          //
          //
          // geometry.translation.set(campos.x, campos.y, campos.z)
          // geometry.rotation.set(camrot.x, camrot.y, camrot.z);
          //geometry.intersect()

          // if(frust.intersectsObject(geometry)){
          //
          // }




          for(let j = 0; j < NUM_LIGHTS; ++j) {



            const light = scene.lights[j];

            const lightPos = new Vector4(light.position[0], light.position[1], light.position[2], 1);
            lightPos.applyMatrix4(camera.matrixWorldInverse);
            const collSphere = new Sphere(new Vector3(lightPos.x, lightPos.y, lightPos.z), light.radius);
            //
            // let lightCenter = vec3.fromValues(scene.lights[l].position[0], scene.lights[l].position[1], scene.lights[l].position[2]);
            // let lightCenterVec4 = vec4.fromValues(lightCenter[0], lightCenter[1], lightCenter[2], 1);
            // let lightRadius = scene.lights[l].radius;
            // vec4.transformMat4(lightCenterVec4, lightCenterVec4, viewMatrix);
            // lightCenter = vec3.fromValues(lightCenterVec4[0], lightCenterVec4[1], lightCenterVec4[2]);



            if(collSphere.intersectsBox(this._clusterAABB[i])){

              const cur_lights = this._clusterTexture.buffer[this._clusterTexture.bufferIndex(i, 0)];
              if (cur_lights < MAX_LIGHTS_PER_CLUSTER){

                this._clusterTexture.buffer[this._clusterTexture.bufferIndex(i, 0)] = cur_lights + 1;

                // update to store light index
                let row = Math.floor((cur_lights + 1) / 4);
                let txl_idx = cur_lights + 1 - row * 4;
                this._clusterTexture.buffer[this._clusterTexture.bufferIndex(i, row) + txl_idx] = j;

                // this._clusterTexture.buffer[this._clusterTexture.bufferIndex(i, cur_lights + 1)] = j;
                // this._clusterTexture.buffer[this._clusterTexture.bufferIndex(i, 0)] = cur_lights + 1;
              }


            }

          }

        }
      }
    }

    //console.log(this._clusterTexture.buffer[this._clusterTexture.bufferIndex(50, 0)])


    this._clusterTexture.update();
  }
}