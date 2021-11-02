export default function(params) {
  return `
  // TODO: This is pretty much just a clone of forward.frag.glsl.js

  #version 100
  precision highp float;

  uniform sampler2D u_colmap;
  uniform sampler2D u_normap;
  uniform sampler2D u_lightbuffer;

  // TODO: Read this buffer to determine the lights influencing a cluster
  uniform sampler2D u_clusterbuffer;
  
  uniform float u_near;
  uniform float u_far;
  uniform float u_width;
  uniform float u_height;

  uniform mat4 u_view;
  uniform vec3 u_camPos;

  varying vec3 v_position;
  varying vec3 v_normal;
  varying vec2 v_uv;

  vec3 applyNormalMap(vec3 geomnor, vec3 normap) {
    normap = normap * 2.0 - 1.0;
    vec3 up = normalize(vec3(0.001, 1, 0.001));
    vec3 surftan = normalize(cross(geomnor, up));
    vec3 surfbinor = cross(geomnor, surftan);
    return normap.y * surftan + normap.x * surfbinor + normap.z * geomnor;
  }

  struct Light {
    vec3 position;
    float radius;
    vec3 color;
  };

  float ExtractFloat(sampler2D texture, int textureWidth, int textureHeight, int index, int component) {
    float u = float(index + 1) / float(textureWidth + 1);
    int pixel = component / 4;
    float v = float(pixel + 1) / float(textureHeight + 1);
    vec4 texel = texture2D(texture, vec2(u, v));
    int pixelComponent = component - pixel * 4;
    if (pixelComponent == 0) {
      return texel[0];
    } else if (pixelComponent == 1) {
      return texel[1];
    } else if (pixelComponent == 2) {
      return texel[2];
    } else if (pixelComponent == 3) {
      return texel[3];
    }
  }

  Light UnpackLight(int index) {
    Light light;
    float u = float(index + 1) / float(${params.numLights + 1});
    vec4 v1 = texture2D(u_lightbuffer, vec2(u, 0.3));
    vec4 v2 = texture2D(u_lightbuffer, vec2(u, 0.6));
    light.position = v1.xyz;

    // LOOK: This extracts the 4th float (radius) of the (index)th light in the buffer
    // Note that this is just an example implementation to extract one float.
    // There are more efficient ways if you need adjacent values
    light.radius = ExtractFloat(u_lightbuffer, ${params.numLights}, 2, index, 3);

    light.color = v2.rgb;
    return light;
  }

  // Cubic approximation of gaussian curve so we falloff to exactly 0 at the light radius
  float cubicGaussian(float h) {
    if (h < 1.0) {
      return 0.25 * pow(2.0 - h, 3.0) - pow(1.0 - h, 3.0);
    } else if (h < 2.0) {
      return 0.25 * pow(2.0 - h, 3.0);
    } else {
      return 0.0;
    }
  }

  void main() {
    vec3 albedo = texture2D(u_colmap, v_uv).rgb;
    vec3 normap = texture2D(u_normap, v_uv).xyz;
    vec3 normal = applyNormalMap(v_normal, normap);

    vec3 fragColor = vec3(0.0);
    
    // determine which cluster index we are in
    // it seems like we need to basically do almost the same calculations as before?
    // luckily I guess we don't need to re calculate the x/y as they are already part of the shader 
    int cx = int(gl_FragCoord.x / u_width * float(${params.xSlices}));
    int cy = int(gl_FragCoord.y / u_height * float(${params.ySlices}));
    
    // for z, we need to repeat another version of the technique used for the cpu calculation
    // use the view matrix to get our coordinate system into camera-based coordinates 
    vec4 transCamPos = u_view * vec4(v_position, 1.0);   
    float Z = distance(vec3(u_camPos), vec3(v_position)) - u_near;
    
    float fraq1 =  float(${params.zSlices}) / log(u_far / u_near);
    float fraq2 =  ( float(${params.zSlices}) * log(u_near) ) / log( u_far / u_near);
    
    int cz = int( float(${params.zSlices}) - ((log(-transCamPos.z) *  fraq1)  - fraq2 )); 
    //int cz = 1;
    
    //int cz = int((-transCamPos.z - u_near) / (u_far - u_near) * float(${params.zSlices}));
    
    
    // using the indexes, get the buffer indexes by using the 3d offsets
    int cluster_idx = cx + cy * ${params.xSlices} + cz * ${params.xSlices} * ${params.ySlices};
    int bufWidth = ${params.xSlices} * ${params.ySlices} * ${params.zSlices};
    // divide by four because each stores x,y,z,rad    
    int bufHeight = int(float(${params.maxLights} + 1) / 4.0) + 1;
    
    // finally, extract info from buffer using the provided function
    int num_lights = int(ExtractFloat(u_clusterbuffer, bufWidth, bufHeight,  cluster_idx, 0)); 


    for (int i = 0; i < ${params.numLights}; i++) {
    
      // can not seem to use this as a loop sentinel for some reason
      if (i >= num_lights) {
         break;
      }
      
      // use the light index
      int light_idx = int(ExtractFloat(u_clusterbuffer, bufWidth, bufHeight,  cluster_idx, i + 1));
      
    
      Light light = UnpackLight(light_idx);
      float lightDistance = distance(light.position, v_position);
      vec3 L = (light.position - v_position) / lightDistance;

      float lightIntensity = cubicGaussian(2.0 * lightDistance / light.radius);
      float lambertTerm = max(dot(L, normal), 0.0);

      fragColor += albedo * lambertTerm * light.color * vec3(lightIntensity);
    }

    const vec3 ambientLight = vec3(0.025);
    fragColor += albedo * ambientLight;

    gl_FragColor = vec4(fragColor, 1.0);
  }
  `;
}
