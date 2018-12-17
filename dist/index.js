(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.WebGLHeatmap = f()}})(function(){var define,module,exports;return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
'use strict';

function Framebuffer(gl) {
  this.gl = gl;
  this.buffer = this.gl.createFramebuffer();
}

Framebuffer.prototype.destroy = function() {
  return this.gl.deleteFRamebuffer(this.buffer);
};

Framebuffer.prototype.bind = function() {
  this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.buffer);
  return this;
};

Framebuffer.prototype.unbind = function() {
  this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
  return this;
};

Framebuffer.prototype.check = function() {
  var result;
  result = this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER);
  switch (result) {
    case this.gl.FRAMEBUFFER_UNSUPPORTED:
      throw 'Framebuffer is unsupported';
      break;
    case this.gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT:
      throw 'Framebuffer incomplete attachment';
      break;
    case this.gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS:
      throw 'Framebuffer incomplete dimensions';
      break;
    case this.gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT:
      throw 'Framebuffer incomplete missing attachment';
  }
  return this;
};

Framebuffer.prototype.color = function(texture) {
  this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, texture.target, texture.handle, 0);
  this.check();
  return this;
};

Framebuffer.prototype.depth = function(buffer) {
  this.gl.framebufferRenderbuffer(this.gl.FRAMEBUFFER, this.gl.DEPTH_ATTACHMENT, this.gl.RENDERBUFFER, buffer.id);
  this.check();
  return this;
};

Framebuffer.prototype.destroy = function() {
  return this.gl.deleteFramebuffer(this.buffer);
};

module.exports = Framebuffer;

},{}],2:[function(require,module,exports){
'use strict';

var HeatmapShader = require('./heatmap-shader');

var path = require('path');
/* eslint-disable max-len */
var vertexShaderBlit = "attribute vec4 position;\nvarying vec2 texcoord;\nvoid main() {\n  texcoord = position.xy * 0.5 + 0.5;\n  gl_Position = position;\n}";
var fragmentShaderBlit = "#ifdef GL_FRAGMENT_PRECISION_HIGH\n    precision highp int;\n    precision highp float;\n#else\n    precision mediump int;\n    precision mediump float;\n#endif\nuniform sampler2D source;\nvarying vec2 texcoord;";
/* eslint-enable max-len */
var HeatmapNode = require('./heatmap-node');

function HeatmapHeights(heatmap, gl, width, height) {
  var i, _i, _ref;
  this.heatmap = heatmap;
  this.gl = gl;
  this.width = width;
  this.height = height;
  this.shader = new HeatmapShader(this.gl, {
    vertex: 'attribute vec4 position, intensity;\nvarying vec2 off, dim;\nvarying float vIntensity;\nuniform vec2 viewport;\n\nvoid main(){\n    dim = abs(position.zw);\n    off = position.zw;\n    vec2 pos = position.xy + position.zw;\n    vIntensity = intensity.x;\n    gl_Position = vec4((pos/viewport)*2.0-1.0, 0.0, 1.0);\n}',
    fragment: '#ifdef GL_FRAGMENT_PRECISION_HIGH\n    precision highp int;\n    precision highp float;\n#else\n    precision mediump int;\n    precision mediump float;\n#endif\nvarying vec2 off, dim;\nvarying float vIntensity;\nvoid main(){\n    float falloff = (1.0 - smoothstep(0.0, 1.0, length(off/dim)));\n    float intensity = falloff*vIntensity;\n    gl_FragColor = vec4(intensity);\n}'
  });
  this.clampShader = new HeatmapShader(this.gl, {
    vertex: vertexShaderBlit,
    fragment: fragmentShaderBlit + 'uniform float low, high;\nvoid main(){\n    gl_FragColor = vec4(clamp(texture2D(source, texcoord).rgb, low, high), 1.0);\n}'
  });
  this.multiplyShader = new HeatmapShader(this.gl, {
    vertex: vertexShaderBlit,
    fragment: fragmentShaderBlit + 'uniform float value;\nvoid main(){\n    gl_FragColor = vec4(texture2D(source, texcoord).rgb*value, 1.0);\n}'
  });
  this.blurShader = new HeatmapShader(this.gl, {
    vertex: vertexShaderBlit,
    fragment: fragmentShaderBlit + 'uniform vec2 viewport;\nvoid main(){\n    vec4 result = vec4(0.0);\n    for(int x=-1; x<=1; x++){\n        for(int y=-1; y<=1; y++){\n            vec2 off = vec2(x,y)/viewport;\n            //float factor = 1.0 - smoothstep(0.0, 1.5, length(off));\n            float factor = 1.0;\n            result += vec4(texture2D(source, texcoord+off).rgb*factor, factor);\n        }\n    }\n    gl_FragColor = vec4(result.rgb/result.w, 1.0);\n}'
  });
  this.nodeBack = new HeatmapNode(this.gl, this.width, this.height);
  this.nodeFront = new HeatmapNode(this.gl, this.width, this.height);
  this.vertexBuffer = this.gl.createBuffer();
  this.vertexSize = 8;
  this.maxPointCount = 1024 * 10;
  this.vertexBufferData = new Float32Array(this.maxPointCount * this.vertexSize * 6);
  this.vertexBufferViews = [];
  for (i = _i = 0, _ref = this.maxPointCount; 0 <= _ref ? _i < _ref : _i > _ref; i = 0 <= _ref ? ++_i : --_i) {
    this.vertexBufferViews.push(new Float32Array(this.vertexBufferData.buffer, 0, i * this.vertexSize * 6));
  }
  this.bufferIndex = 0;
  this.pointCount = 0;
}

HeatmapHeights.prototype.resize = function(width, height) {
  this.width = width;
  this.height = height;
  this.nodeBack.resize(this.width, this.height);
  return this.nodeFront.resize(this.width, this.height);
};

HeatmapHeights.prototype.update = function() {
  var intensityLoc, positionLoc;
  if (this.pointCount > 0) {
    this.gl.enable(this.gl.BLEND);
    this.nodeFront.use();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, this.vertexBufferViews[this.pointCount], this.gl.STREAM_DRAW);
    positionLoc = this.shader.attribLocation('position');
    intensityLoc = this.shader.attribLocation('intensity');
    this.gl.enableVertexAttribArray(1);
    this.gl.vertexAttribPointer(positionLoc, 4, this.gl.FLOAT, false, 8 * 4, 0 * 4);
    this.gl.vertexAttribPointer(intensityLoc, 4, this.gl.FLOAT, false, 8 * 4, 4 * 4);
    this.shader.use().vec2('viewport', this.width, this.height);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, this.pointCount * 6);
    this.gl.disableVertexAttribArray(1);
    this.pointCount = 0;
    this.bufferIndex = 0;
    this.nodeFront.end();
    return this.gl.disable(this.gl.BLEND);
  }
};

HeatmapHeights.prototype.clear = function() {
  this.nodeFront.use();
  this.gl.clearColor(0, 0, 0, 1);
  this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  return this.nodeFront.end();
};

HeatmapHeights.prototype.clamp = function(min, max) {
  this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.heatmap.quad);
  this.gl.vertexAttribPointer(0, 4, this.gl.FLOAT, false, 0, 0);
  this.nodeFront.bind(0);
  this.nodeBack.use();
  this.clampShader.use().int('source', 0).float('low', min).float('high', max);
  this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
  this.nodeBack.end();
  return this.swap();
};

HeatmapHeights.prototype.multiply = function(value) {
  this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.heatmap.quad);
  this.gl.vertexAttribPointer(0, 4, this.gl.FLOAT, false, 0, 0);
  this.nodeFront.bind(0);
  this.nodeBack.use();
  this.multiplyShader.use().int('source', 0).float('value', value);
  this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
  this.nodeBack.end();
  return this.swap();
};

HeatmapHeights.prototype.blur = function() {
  this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.heatmap.quad);
  this.gl.vertexAttribPointer(0, 4, this.gl.FLOAT, false, 0, 0);
  this.nodeFront.bind(0);
  this.nodeBack.use();
  this.blurShader.use().int('source', 0).vec2('viewport', this.width, this.height);
  this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
  this.nodeBack.end();
  return this.swap();
};

HeatmapHeights.prototype.swap = function() {
  var tmp;
  tmp = this.nodeFront;
  this.nodeFront = this.nodeBack;
  return this.nodeBack = tmp;
};

HeatmapHeights.prototype.addVertex = function(x, y, xs, ys, intensity) {
  this.vertexBufferData[this.bufferIndex++] = x;
  this.vertexBufferData[this.bufferIndex++] = y;
  this.vertexBufferData[this.bufferIndex++] = xs;
  this.vertexBufferData[this.bufferIndex++] = ys;
  this.vertexBufferData[this.bufferIndex++] = intensity;
  this.vertexBufferData[this.bufferIndex++] = intensity;
  this.vertexBufferData[this.bufferIndex++] = intensity;
  return this.vertexBufferData[this.bufferIndex++] = intensity;
};

HeatmapHeights.prototype.addPoint = function(x, y, size, intensity) {
  var s;
  if (size == null) {
    size = 50;
  }
  if (intensity == null) {
    intensity = 0.2;
  }
  if (this.pointCount >= this.maxPointCount - 1) {
    this.update();
  }
  y = this.height - y;
  s = size / 2;
  this.addVertex(x, y, -s, -s, intensity);
  this.addVertex(x, y, +s, -s, intensity);
  this.addVertex(x, y, -s, +s, intensity);
  this.addVertex(x, y, -s, +s, intensity);
  this.addVertex(x, y, +s, -s, intensity);
  this.addVertex(x, y, +s, +s, intensity);
  return this.pointCount += 1;
};

module.exports = HeatmapHeights;


},{"./heatmap-node":3,"./heatmap-shader":4,"path":11}],3:[function(require,module,exports){
'use strict';

var HeatmapTexture = require('./heatmap-texture');
var Framebuffer = require('./framebuffer');

function HeatmapNode(gl, width, height) {
  var floatExt;
  this.gl = gl;
  this.width = width;
  this.height = height;
  floatExt = this.gl.getFloatExtension({
    require: ['renderable']
  });
  this.texture = new HeatmapTexture(this.gl, {
    type: floatExt.type
  }).bind(0).setSize(this.width, this.height).nearest().clampToEdge();
  this.fbo = new Framebuffer(this.gl).bind().color(this.texture).unbind();
}

HeatmapNode.prototype.use = function() {
  return this.fbo.bind();
};

HeatmapNode.prototype.bind = function(unit) {
  return this.texture.bind(unit);
};

HeatmapNode.prototype.end = function() {
  return this.fbo.unbind();
};

HeatmapNode.prototype.resize = function(width, height) {
  this.width = width;
  this.height = height;
  return this.texture.bind(0).setSize(this.width, this.height);
};

module.exports = HeatmapNode;

},{"./framebuffer":1,"./heatmap-texture":5}],4:[function(require,module,exports){
'use strict';

function HeatmapShader(gl, _arg) {
  var fragment, vertex;
  this.gl = gl;
  vertex = _arg.vertex, fragment = _arg.fragment;
  this.program = this.gl.createProgram();
  this.vs = this.gl.createShader(this.gl.VERTEX_SHADER);
  this.fs = this.gl.createShader(this.gl.FRAGMENT_SHADER);
  this.gl.attachShader(this.program, this.vs);
  this.gl.attachShader(this.program, this.fs);
  this.compileShader(this.vs, vertex);
  this.compileShader(this.fs, fragment);
  this.link();
  this.value_cache = {};
  this.uniform_cache = {};
  this.attribCache = {};
}

HeatmapShader.prototype.attribLocation = function(name) {
  var location;
  location = this.attribCache[name];
  if (location === void 0) {
    location = this.attribCache[name] = this.gl.getAttribLocation(this.program, name);
  }
  return location;
};

HeatmapShader.prototype.compileShader = function(shader, source) {
  this.gl.shaderSource(shader, source);
  this.gl.compileShader(shader);
  if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
    throw "Shader Compile Error: " + (this.gl.getShaderInfoLog(shader));
  }
};

HeatmapShader.prototype.link = function() {
  this.gl.linkProgram(this.program);
  if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
    throw "Shader Link Error: " + (this.gl.getProgramInfoLog(this.program));
  }
};

HeatmapShader.prototype.use = function() {
  this.gl.useProgram(this.program);
  return this;
};

HeatmapShader.prototype.uniformLoc = function(name) {
  var location;
  location = this.uniform_cache[name];
  if (location === void 0) {
    location = this.uniform_cache[name] = this.gl.getUniformLocation(this.program, name);
  }
  return location;
};

HeatmapShader.prototype.int = function(name, value) {
  var cached, loc;
  cached = this.value_cache[name];
  if (cached !== value) {
    this.value_cache[name] = value;
    loc = this.uniformLoc(name);
    if (loc) {
      this.gl.uniform1i(loc, value);
    }
  }
  return this;
};

HeatmapShader.prototype.vec2 = function(name, a, b) {
  var loc;
  loc = this.uniformLoc(name);
  if (loc) {
    this.gl.uniform2f(loc, a, b);
  }
  return this;
};

HeatmapShader.prototype.float = function(name, value) {
  var cached, loc;
  cached = this.value_cache[name];
  if (cached !== value) {
    this.value_cache[name] = value;
    loc = this.uniformLoc(name);
    if (loc) {
      this.gl.uniform1f(loc, value);
    }
  }
  return this;
};

module.exports = HeatmapShader;


},{}],5:[function(require,module,exports){
'use strict';

function HeatmapTexture(gl, params) {
  var _ref, _ref1;
  this.gl = gl;
  if (params == null) {
    params = {};
  }
  this.channels = this.gl[((_ref = params.channels) != null ? _ref : 'rgba').toUpperCase()];
  if (typeof params.type === 'number') {
    this.type = params.type;
  } else {
    this.type = this.gl[((_ref1 = params.type) != null ? _ref1 : 'unsigned_byte').toUpperCase()];
  }
  switch (this.channels) {
    case this.gl.RGBA:
      this.chancount = 4;
      break;
    case this.gl.RGB:
      this.chancount = 3;
      break;
    case this.gl.LUMINANCE_ALPHA:
      this.chancount = 2;
      break;
    default:
      this.chancount = 1;
  }
  this.target = this.gl.TEXTURE_2D;
  this.handle = this.gl.createTexture();
}

HeatmapTexture.prototype.destroy = function() {
  return this.gl.deleteTexture(this.handle);
};

HeatmapTexture.prototype.bind = function(unit) {
  if (unit == null) {
    unit = 0;
  }
  if (unit > 15) {
    throw 'Texture unit too large: ' + unit;
  }
  this.gl.activeTexture(this.gl.TEXTURE0 + unit);
  this.gl.bindTexture(this.target, this.handle);
  return this;
};

HeatmapTexture.prototype.setSize = function(width, height) {
  this.width = width;
  this.height = height;
  this.gl.texImage2D(this.target, 0, this.channels, this.width, this.height, 0, this.channels, this.type, null);
  return this;
};

HeatmapTexture.prototype.upload = function(data) {
  this.width = data.width;
  this.height = data.height;
  this.gl.texImage2D(this.target, 0, this.channels, this.channels, this.type, data);
  return this;
};

HeatmapTexture.prototype.linear = function() {
  this.gl.texParameteri(this.target, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
  this.gl.texParameteri(this.target, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
  return this;
};

HeatmapTexture.prototype.nearest = function() {
  this.gl.texParameteri(this.target, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
  this.gl.texParameteri(this.target, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
  return this;
};

HeatmapTexture.prototype.clampToEdge = function() {
  this.gl.texParameteri(this.target, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
  this.gl.texParameteri(this.target, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
  return this;
};

HeatmapTexture.prototype.repeat = function() {
  this.gl.texParameteri(this.target, this.gl.TEXTURE_WRAP_S, this.gl.REPEAT);
  this.gl.texParameteri(this.target, this.gl.TEXTURE_WRAP_T, this.gl.REPEAT);
  return this;
};

module.exports = HeatmapTexture;

},{}],6:[function(require,module,exports){
// Generated by CoffeeScript 1.8.0

var WebGLHeatmap = require('./webgl-heatmap');
var HeatmapTexture = require('./heatmap-texture');

var path = require('path');
/* eslint-disable max-len */
var vertexShaderBlit = "attribute vec4 position;\nvarying vec2 texcoord;\nvoid main() {\n  texcoord = position.xy * 0.5 + 0.5;\n  gl_Position = position;\n}";
var fragmentShaderBlit = "#ifdef GL_FRAGMENT_PRECISION_HIGH\n    precision highp int;\n    precision highp float;\n#else\n    precision mediump int;\n    precision mediump float;\n#endif\nuniform sampler2D source;\nvarying vec2 texcoord;";
/* eslint-enable max-len */

var __indexOf = [].indexOf || function(item) {
  for (var i = 0, l = this.length; i < l; i++) {
    if (i in this && this[i] === item) {
      return i;
    }
  }
  return -1;
};

function nukeVendorPrefix() {
  var getExtension, getSupportedExtensions, vendorRe, vendors;
  if (window.WebGLRenderingContext != null) {
    vendors = ['WEBKIT', 'MOZ', 'MS', 'O'];
    vendorRe = /^WEBKIT_(.*)|MOZ_(.*)|MS_(.*)|O_(.*)/;
    getExtension = WebGLRenderingContext.prototype.getExtension;
    WebGLRenderingContext.prototype.getExtension = function(name) {
      var extobj, match, vendor, _i, _len;
      match = name.match(vendorRe);
      if (match !== null) {
        name = match[1];
      }
      extobj = getExtension.call(this, name);
      if (extobj === null) {
        for (_i = 0, _len = vendors.length; _i < _len; _i++) {
          vendor = vendors[_i];
          extobj = getExtension.call(this, vendor + '_' + name);
          if (extobj !== null) {
            return extobj;
          }
        }
        return null;
      } else {
        return extobj;
      }
    };
    getSupportedExtensions = WebGLRenderingContext.prototype.getSupportedExtensions;
    return WebGLRenderingContext.prototype.getSupportedExtensions = function() {
      var extension, match, result, supported, _i, _len;
      supported = getSupportedExtensions.call(this);
      result = [];
      for (_i = 0, _len = supported.length; _i < _len; _i++) {
        extension = supported[_i];
        match = extension.match(vendorRe);
        if (match !== null) {
          extension = match[1];
        }
        if (__indexOf.call(result, extension) < 0) {
          result.push(extension);
        }
      }
      return result;
    };
  }
};

function textureFloatShims() {
  var checkColorBuffer, checkFloatLinear, checkSupport, checkTexture, createSourceCanvas, getExtension, getSupportedExtensions, name, shimExtensions, shimLookup, unshimExtensions, unshimLookup, _i, _len;
  createSourceCanvas = function() {
    var canvas, ctx, imageData;
    canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 2;
    ctx = canvas.getContext('2d');
    imageData = ctx.getImageData(0, 0, 2, 2);
    imageData.data.set(new Uint8ClampedArray([0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 0, 0, 255, 255, 255, 255]));
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  };
  createSourceCanvas();
  checkFloatLinear = function(gl, sourceType) {
    var buffer, cleanup, fragmentShader, framebuffer, positionLoc, program, readBuffer, result, source, sourceCanvas, sourceLoc, target, vertexShader, vertices;
    program = gl.createProgram();
    vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.attachShader(program, vertexShader);
    gl.shaderSource(vertexShader, 'attribute vec2 position;\nvoid main(){\n    gl_Position = vec4(position, 0.0, 1.0);\n}');
    gl.compileShader(vertexShader);
    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      throw gl.getShaderInfoLog(vertexShader);
    }
    fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.attachShader(program, fragmentShader);
    gl.shaderSource(fragmentShader, 'uniform sampler2D source;\nvoid main(){\n    gl_FragColor = texture2D(source, vec2(1.0, 1.0));\n}');
    gl.compileShader(fragmentShader);
    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      throw gl.getShaderInfoLog(fragmentShader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw gl.getProgramInfoLog(program);
    }
    gl.useProgram(program);
    cleanup = function() {
      gl.deleteShader(fragmentShader);
      gl.deleteShader(vertexShader);
      gl.deleteProgram(program);
      gl.deleteBuffer(buffer);
      gl.deleteTexture(source);
      gl.deleteTexture(target);
      gl.deleteFramebuffer(framebuffer);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.useProgram(null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      return gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };
    target = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, target);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
    sourceCanvas = createSourceCanvas();
    source = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, sourceType, sourceCanvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    vertices = new Float32Array([1, 1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1]);
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    positionLoc = gl.getAttribLocation(program, 'position');
    sourceLoc = gl.getUniformLocation(program, 'source');
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1i(sourceLoc, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    readBuffer = new Uint8Array(4 * 4);
    gl.readPixels(0, 0, 2, 2, gl.RGBA, gl.UNSIGNED_BYTE, readBuffer);
    result = Math.abs(readBuffer[0] - 127) < 10;
    cleanup();
    return result;
  };
  checkTexture = function(gl, targetType) {
    var target;
    target = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, target);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 2, 0, gl.RGBA, targetType, null);
    if (gl.getError() === 0) {
      gl.deleteTexture(target);
      return true;
    } else {
      gl.deleteTexture(target);
      return false;
    }
  };
  checkColorBuffer = function(gl, targetType) {
    var check, framebuffer, target;
    target = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, target);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 2, 0, gl.RGBA, targetType, null);
    framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
    check = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.deleteTexture(target);
    gl.deleteFramebuffer(framebuffer);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (check === gl.FRAMEBUFFER_COMPLETE) {
      return true;
    } else {
      return false;
    }
  };
  shimExtensions = [];
  shimLookup = {};
  unshimExtensions = [];
  checkSupport = function() {
    var canvas, extobj, gl, halfFloatExt, halfFloatTexturing, singleFloatExt, singleFloatTexturing;
    canvas = document.createElement('canvas');
    gl = null;
    try {
      gl = canvas.getContext('experimental-webgl');
      if (gl === null) {
        gl = canvas.getContext('webgl');
      }
    } catch (_error) {}
    if (gl != null) {
      singleFloatExt = gl.getExtension('OES_texture_float');
      if (singleFloatExt === null) {
        if (checkTexture(gl, gl.FLOAT)) {
          singleFloatTexturing = true;
          shimExtensions.push('OES_texture_float');
          shimLookup.OES_texture_float = {
            shim: true
          };
        } else {
          singleFloatTexturing = false;
          unshimExtensions.push('OES_texture_float');
        }
      } else {
        if (checkTexture(gl, gl.FLOAT)) {
          singleFloatTexturing = true;
          shimExtensions.push('OES_texture_float');
        } else {
          singleFloatTexturing = false;
          unshimExtensions.push('OES_texture_float');
        }
      }
      if (singleFloatTexturing) {
        extobj = gl.getExtension('WEBGL_color_buffer_float');
        if (extobj === null) {
          if (checkColorBuffer(gl, gl.FLOAT)) {
            shimExtensions.push('WEBGL_color_buffer_float');
            shimLookup.WEBGL_color_buffer_float = {
              shim: true,
              RGBA32F_EXT: 0x8814,
              RGB32F_EXT: 0x8815,
              FRAMEBUFFER_ATTACHMENT_COMPONENT_TYPE_EXT: 0x8211,
              UNSIGNED_NORMALIZED_EXT: 0x8C17
            };
          } else {
            unshimExtensions.push('WEBGL_color_buffer_float');
          }
        } else {
          if (checkColorBuffer(gl, gl.FLOAT)) {
            shimExtensions.push('WEBGL_color_buffer_float');
          } else {
            unshimExtensions.push('WEBGL_color_buffer_float');
          }
        }
        extobj = gl.getExtension('OES_texture_float_linear');
        if (extobj === null) {
          if (checkFloatLinear(gl, gl.FLOAT)) {
            shimExtensions.push('OES_texture_float_linear');
            shimLookup.OES_texture_float_linear = {
              shim: true
            };
          } else {
            unshimExtensions.push('OES_texture_float_linear');
          }
        } else {
          if (checkFloatLinear(gl, gl.FLOAT)) {
            shimExtensions.push('OES_texture_float_linear');
          } else {
            unshimExtensions.push('OES_texture_float_linear');
          }
        }
      }
      halfFloatExt = gl.getExtension('OES_texture_half_float');
      if (halfFloatExt === null) {
        if (checkTexture(gl, 0x8D61)) {
          halfFloatTexturing = true;
          shimExtensions.push('OES_texture_half_float');
          halfFloatExt = shimLookup.OES_texture_half_float = {
            HALF_FLOAT_OES: 0x8D61,
            shim: true
          };
        } else {
          halfFloatTexturing = false;
          unshimExtensions.push('OES_texture_half_float');
        }
      } else {
        if (checkTexture(gl, halfFloatExt.HALF_FLOAT_OES)) {
          halfFloatTexturing = true;
          shimExtensions.push('OES_texture_half_float');
        } else {
          halfFloatTexturing = false;
          unshimExtensions.push('OES_texture_half_float');
        }
      }
      if (halfFloatTexturing) {
        extobj = gl.getExtension('EXT_color_buffer_half_float');
        if (extobj === null) {
          if (checkColorBuffer(gl, halfFloatExt.HALF_FLOAT_OES)) {
            shimExtensions.push('EXT_color_buffer_half_float');
            shimLookup.EXT_color_buffer_half_float = {
              shim: true,
              RGBA16F_EXT: 0x881A,
              RGB16F_EXT: 0x881B,
              FRAMEBUFFER_ATTACHMENT_COMPONENT_TYPE_EXT: 0x8211,
              UNSIGNED_NORMALIZED_EXT: 0x8C17
            };
          } else {
            unshimExtensions.push('EXT_color_buffer_half_float');
          }
        } else {
          if (checkColorBuffer(gl, halfFloatExt.HALF_FLOAT_OES)) {
            shimExtensions.push('EXT_color_buffer_half_float');
          } else {
            unshimExtensions.push('EXT_color_buffer_half_float');
          }
        }
        extobj = gl.getExtension('OES_texture_half_float_linear');
        if (extobj === null) {
          if (checkFloatLinear(gl, halfFloatExt.HALF_FLOAT_OES)) {
            shimExtensions.push('OES_texture_half_float_linear');
            return shimLookup.OES_texture_half_float_linear = {
              shim: true
            };
          } else {
            return unshimExtensions.push('OES_texture_half_float_linear');
          }
        } else {
          if (checkFloatLinear(gl, halfFloatExt.HALF_FLOAT_OES)) {
            return shimExtensions.push('OES_texture_half_float_linear');
          } else {
            return unshimExtensions.push('OES_texture_half_float_linear');
          }
        }
      }
    }
  };
  if (window.WebGLRenderingContext != null) {
    checkSupport();
    unshimLookup = {};
    for (_i = 0, _len = unshimExtensions.length; _i < _len; _i++) {
      name = unshimExtensions[_i];
      unshimLookup[name] = true;
    }
    getExtension = WebGLRenderingContext.prototype.getExtension;
    WebGLRenderingContext.prototype.getExtension = function(name) {
      var extobj;
      extobj = shimLookup[name];
      if (extobj === void 0) {
        if (unshimLookup[name]) {
          return null;
        } else {
          return getExtension.call(this, name);
        }
      } else {
        return extobj;
      }
    };
    getSupportedExtensions = WebGLRenderingContext.prototype.getSupportedExtensions;
    WebGLRenderingContext.prototype.getSupportedExtensions = function() {
      var extension, result, supported, _j, _k, _len1, _len2;
      supported = getSupportedExtensions.call(this);
      result = [];
      for (_j = 0, _len1 = supported.length; _j < _len1; _j++) {
        extension = supported[_j];
        if (unshimLookup[extension] === void 0) {
          result.push(extension);
        }
      }
      for (_k = 0, _len2 = shimExtensions.length; _k < _len2; _k++) {
        extension = shimExtensions[_k];
        if (__indexOf.call(result, extension) < 0) {
          result.push(extension);
        }
      }
      return result;
    };
    return WebGLRenderingContext.prototype.getFloatExtension = function(spec) {
      var candidate, candidates, half, halfFramebuffer, halfLinear, halfTexture, i, importance, preference, result, single, singleFramebuffer, singleLinear, singleTexture, use, _j, _k, _l, _len1, _len2, _len3, _len4, _m, _ref, _ref1, _ref2;
      if (spec.prefer == null) {
        spec.prefer = ['half'];
      }
      if (spec.require == null) {
        spec.require = [];
      }
      if (spec.throws == null) {
        spec.throws = true;
      }
      singleTexture = this.getExtension('OES_texture_float');
      halfTexture = this.getExtension('OES_texture_half_float');
      singleFramebuffer = this.getExtension('WEBGL_color_buffer_float');
      halfFramebuffer = this.getExtension('EXT_color_buffer_half_float');
      singleLinear = this.getExtension('OES_texture_float_linear');
      halfLinear = this.getExtension('OES_texture_half_float_linear');
      single = {
        texture: singleTexture !== null,
        filterable: singleLinear !== null,
        renderable: singleFramebuffer !== null,
        score: 0,
        precision: 'single',
        half: false,
        single: true,
        type: this.FLOAT
      };
      half = {
        texture: halfTexture !== null,
        filterable: halfLinear !== null,
        renderable: halfFramebuffer !== null,
        score: 0,
        precision: 'half',
        half: true,
        single: false,
        type: (_ref = halfTexture != null ? halfTexture.HALF_FLOAT_OES : void 0) != null ? _ref : null
      };
      candidates = [];
      if (single.texture) {
        candidates.push(single);
      }
      if (half.texture) {
        candidates.push(half);
      }
      result = [];
      for (_j = 0, _len1 = candidates.length; _j < _len1; _j++) {
        candidate = candidates[_j];
        use = true;
        _ref1 = spec.require;
        for (_k = 0, _len2 = _ref1.length; _k < _len2; _k++) {
          name = _ref1[_k];
          if (candidate[name] === false) {
            use = false;
          }
        }
        if (use) {
          result.push(candidate);
        }
      }
      for (_l = 0, _len3 = result.length; _l < _len3; _l++) {
        candidate = result[_l];
        _ref2 = spec.prefer;
        for (i = _m = 0, _len4 = _ref2.length; _m < _len4; i = ++_m) {
          preference = _ref2[i];
          importance = Math.pow(2, spec.prefer.length - i - 1);
          if (candidate[preference]) {
            candidate.score += importance;
          }
        }
      }
      result.sort(function sort(a, b) {
        if (a.score === b.score) {
          return 0;
        } else if (a.score < b.score) {
          return 1;
        } else if (a.score > b.score) {
          return -1;
        }
      });
      if (result.length === 0) {
        if (spec.throws) {
          throw 'No floating point texture support that is ' +
            spec.require.join(', ');
        } else {
          return null;
        }
      } else {
        result = result[0];
        return {
          filterable: result.filterable,
          renderable: result.renderable,
          type: result.type,
          precision: result.precision
        };
      }
    };
  }
}

nukeVendorPrefix();
textureFloatShims();

module.exports = WebGLHeatmap;


},{"./heatmap-texture":5,"./webgl-heatmap":12,"path":11}],7:[function(require,module,exports){

},{}],8:[function(require,module,exports){
// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) { return [] }

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],9:[function(require,module,exports){
(function (global){
var topLevel = typeof global !== 'undefined' ? global :
    typeof window !== 'undefined' ? window : {}
var minDoc = require('min-document');

var doccy;

if (typeof document !== 'undefined') {
    doccy = document;
} else {
    doccy = topLevel['__GLOBAL_DOCUMENT_CACHE@4'];

    if (!doccy) {
        doccy = topLevel['__GLOBAL_DOCUMENT_CACHE@4'] = minDoc;
    }
}

module.exports = doccy;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"min-document":7}],10:[function(require,module,exports){
(function (global){
var win;

if (typeof window !== "undefined") {
    win = window;
} else if (typeof global !== "undefined") {
    win = global;
} else if (typeof self !== "undefined"){
    win = self;
} else {
    win = {};
}

module.exports = win;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],11:[function(require,module,exports){
(function (process){
// .dirname, .basename, and .extname methods are extracted from Node.js v8.11.1,
// backported and transplited with Babel, with backwards-compat fixes

// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length - 1; i >= 0; i--) {
    var last = parts[i];
    if (last === '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
  var resolvedPath = '',
      resolvedAbsolute = false;

  for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    var path = (i >= 0) ? arguments[i] : process.cwd();

    // Skip empty and invalid entries
    if (typeof path !== 'string') {
      throw new TypeError('Arguments to path.resolve must be strings');
    } else if (!path) {
      continue;
    }

    resolvedPath = path + '/' + resolvedPath;
    resolvedAbsolute = path.charAt(0) === '/';
  }

  // At this point the path should be resolved to a full absolute path, but
  // handle relative paths to be safe (might happen when process.cwd() fails)

  // Normalize the path
  resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
  var isAbsolute = exports.isAbsolute(path),
      trailingSlash = substr(path, -1) === '/';

  // Normalize the path
  path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }

  return (isAbsolute ? '/' : '') + path;
};

// posix version
exports.isAbsolute = function(path) {
  return path.charAt(0) === '/';
};

// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    if (typeof p !== 'string') {
      throw new TypeError('Arguments to path.join must be strings');
    }
    return p;
  }).join('/'));
};


// path.relative(from, to)
// posix version
exports.relative = function(from, to) {
  from = exports.resolve(from).substr(1);
  to = exports.resolve(to).substr(1);

  function trim(arr) {
    var start = 0;
    for (; start < arr.length; start++) {
      if (arr[start] !== '') break;
    }

    var end = arr.length - 1;
    for (; end >= 0; end--) {
      if (arr[end] !== '') break;
    }

    if (start > end) return [];
    return arr.slice(start, end - start + 1);
  }

  var fromParts = trim(from.split('/'));
  var toParts = trim(to.split('/'));

  var length = Math.min(fromParts.length, toParts.length);
  var samePartsLength = length;
  for (var i = 0; i < length; i++) {
    if (fromParts[i] !== toParts[i]) {
      samePartsLength = i;
      break;
    }
  }

  var outputParts = [];
  for (var i = samePartsLength; i < fromParts.length; i++) {
    outputParts.push('..');
  }

  outputParts = outputParts.concat(toParts.slice(samePartsLength));

  return outputParts.join('/');
};

exports.sep = '/';
exports.delimiter = ':';

exports.dirname = function (path) {
  if (typeof path !== 'string') path = path + '';
  if (path.length === 0) return '.';
  var code = path.charCodeAt(0);
  var hasRoot = code === 47 /*/*/;
  var end = -1;
  var matchedSlash = true;
  for (var i = path.length - 1; i >= 1; --i) {
    code = path.charCodeAt(i);
    if (code === 47 /*/*/) {
        if (!matchedSlash) {
          end = i;
          break;
        }
      } else {
      // We saw the first non-path separator
      matchedSlash = false;
    }
  }

  if (end === -1) return hasRoot ? '/' : '.';
  if (hasRoot && end === 1) {
    // return '//';
    // Backwards-compat fix:
    return '/';
  }
  return path.slice(0, end);
};

function basename(path) {
  if (typeof path !== 'string') path = path + '';

  var start = 0;
  var end = -1;
  var matchedSlash = true;
  var i;

  for (i = path.length - 1; i >= 0; --i) {
    if (path.charCodeAt(i) === 47 /*/*/) {
        // If we reached a path separator that was not part of a set of path
        // separators at the end of the string, stop now
        if (!matchedSlash) {
          start = i + 1;
          break;
        }
      } else if (end === -1) {
      // We saw the first non-path separator, mark this as the end of our
      // path component
      matchedSlash = false;
      end = i + 1;
    }
  }

  if (end === -1) return '';
  return path.slice(start, end);
}

// Uses a mixed approach for backwards-compatibility, as ext behavior changed
// in new Node.js versions, so only basename() above is backported here
exports.basename = function (path, ext) {
  var f = basename(path);
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};

exports.extname = function (path) {
  if (typeof path !== 'string') path = path + '';
  var startDot = -1;
  var startPart = 0;
  var end = -1;
  var matchedSlash = true;
  // Track the state of characters (if any) we see before our first dot and
  // after any path separator we find
  var preDotState = 0;
  for (var i = path.length - 1; i >= 0; --i) {
    var code = path.charCodeAt(i);
    if (code === 47 /*/*/) {
        // If we reached a path separator that was not part of a set of path
        // separators at the end of the string, stop now
        if (!matchedSlash) {
          startPart = i + 1;
          break;
        }
        continue;
      }
    if (end === -1) {
      // We saw the first non-path separator, mark this as the end of our
      // extension
      matchedSlash = false;
      end = i + 1;
    }
    if (code === 46 /*.*/) {
        // If this is our first dot, mark it as the start of our extension
        if (startDot === -1)
          startDot = i;
        else if (preDotState !== 1)
          preDotState = 1;
    } else if (startDot !== -1) {
      // We saw a non-dot and non-path separator before our dot, so we should
      // have a good chance at having a non-empty extension
      preDotState = -1;
    }
  }

  if (startDot === -1 || end === -1 ||
      // We saw a non-dot character immediately before the dot
      preDotState === 0 ||
      // The (right-most) trimmed path component is exactly '..'
      preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
    return '';
  }
  return path.slice(startDot, end);
};

function filter (xs, f) {
    if (xs.filter) return xs.filter(f);
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (f(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// String.prototype.substr - negative index don't work in IE8
var substr = 'ab'.substr(-1) === 'b'
    ? function (str, start, len) { return str.substr(start, len) }
    : function (str, start, len) {
        if (start < 0) start = str.length + start;
        return str.substr(start, len);
    }
;

}).call(this,require('_process'))

},{"_process":8}],12:[function(require,module,exports){
'use strict';

var document = require('global/document');
var window = require('global/window');

var path = require('path');
/* eslint-disable max-len */
var vertexShaderBlit = "attribute vec4 position;\nvarying vec2 texcoord;\nvoid main() {\n  texcoord = position.xy * 0.5 + 0.5;\n  gl_Position = position;\n}";
var fragmentShaderBlit = "#ifdef GL_FRAGMENT_PRECISION_HIGH\n    precision highp int;\n    precision highp float;\n#else\n    precision mediump int;\n    precision mediump float;\n#endif\nuniform sampler2D source;\nvarying vec2 texcoord;";
/* eslint-enable max-len */
var HeatmapTexture = require('./heatmap-texture');
var HeatmapHeights = require('./heatmap-heights');
var HeatmapShader = require('./heatmap-shader');

function WebGLHeatmap(_arg) {
  var alphaEnd, alphaRange, alphaStart, error, getColorFun, gradientTexture, image, intensityToAlpha, output, quad, textureGradient, _ref, _ref1;
  _ref = _arg != null ? _arg : {}, this.canvas = _ref.canvas, this.width = _ref.width, this.height = _ref.height, intensityToAlpha = _ref.intensityToAlpha, gradientTexture = _ref.gradientTexture, alphaRange = _ref.alphaRange;
  if (!this.canvas) {
    this.canvas = document.createElement('canvas');
  }
  try {
    this.gl = this.canvas.getContext('experimental-webgl', {
      depth: false,
      antialias: false
    });
    if (this.gl === null) {
      this.gl = this.canvas.getContext('webgl', {
        depth: false,
        antialias: false
      });
      if (this.gl === null) {
        throw 'WebGL not supported';
      }
    }
  } catch (_error) {
    error = _error;
    throw 'WebGL not supported';
  }
  if (window.WebGLDebugUtils != null) {
    console.log('debugging mode');
    this.gl = WebGLDebugUtils.makeDebugContext(this.gl, function(err, funcName, args) {
      throw WebGLDebugUtils.glEnumToString(err) + " was caused by call to: " + funcName;
    });
  }
  this.gl.enableVertexAttribArray(0);
  this.gl.blendFunc(this.gl.ONE, this.gl.ONE);
  if (gradientTexture) {
    textureGradient = this.gradientTexture = new HeatmapTexture(this.gl, {
      channels: 'rgba'
    }).bind(0).setSize(2, 2).nearest().clampToEdge();
    if (typeof gradientTexture === 'string') {
      image = new window.Image();
      image.onload = function() {
        return textureGradient.bind().upload(image);
      };
      image.src = gradientTexture;
    } else {
      if (gradientTexture.width > 0 && gradientTexture.height > 0) {
        textureGradient.upload(gradientTexture);
      } else {
        gradientTexture.onload = function() {
          return textureGradient.upload(gradientTexture);
        };
      }
    }
    getColorFun = 'uniform sampler2D gradientTexture;\nvec3 getColor(float intensity){\n    return texture2D(gradientTexture, vec2(intensity, 0.0)).rgb;\n}';
  } else {
    textureGradient = null;
    getColorFun = 'vec3 getColor(float intensity){\n    vec3 blue = vec3(0.0, 0.0, 1.0);\n    vec3 cyan = vec3(0.0, 1.0, 1.0);\n    vec3 green = vec3(0.0, 1.0, 0.0);\n    vec3 yellow = vec3(1.0, 1.0, 0.0);\n    vec3 red = vec3(1.0, 0.0, 0.0);\n\n    vec3 color = (\n        fade(-0.25, 0.25, intensity)*blue +\n        fade(0.0, 0.5, intensity)*cyan +\n        fade(0.25, 0.75, intensity)*green +\n        fade(0.5, 1.0, intensity)*yellow +\n        smoothstep(0.75, 1.0, intensity)*red\n    );\n    return color;\n}';
  }
  if (intensityToAlpha == null) {
    intensityToAlpha = true;
  }
  if (intensityToAlpha) {
    _ref1 = alphaRange != null ? alphaRange : [0, 1], alphaStart = _ref1[0], alphaEnd = _ref1[1];
    output = "vec4 alphaFun(vec3 color, float intensity){\n    float alpha = smoothstep(" + (alphaStart.toFixed(8)) + ", " + (alphaEnd.toFixed(8)) + ", intensity);\n    return vec4(color*alpha, alpha);\n}";
  } else {
    output = 'vec4 alphaFun(vec3 color, float intensity){\n    return vec4(color, 1.0);\n}';
  }
  this.shader = new HeatmapShader(this.gl, {
    vertex: vertexShaderBlit,
    fragment: fragmentShaderBlit + ("float linstep(float low, float high, float value){\n    return clamp((value-low)/(high-low), 0.0, 1.0);\n}\n\nfloat fade(float low, float high, float value){\n    float mid = (low+high)*0.5;\n    float range = (high-low)*0.5;\n    float x = 1.0 - clamp(abs(mid-value)/range, 0.0, 1.0);\n    return smoothstep(0.0, 1.0, x);\n}\n\n" + getColorFun + "\n" + output + "\n\nvoid main(){\n    float intensity = smoothstep(0.0, 1.0, texture2D(source, texcoord).r);\n    vec3 color = getColor(intensity);\n    gl_FragColor = alphaFun(color, intensity);\n}")
  });
  if (this.width == null) {
    this.width = this.canvas.offsetWidth || 2;
  }
  if (this.height == null) {
    this.height = this.canvas.offsetHeight || 2;
  }
  this.canvas.width = this.width;
  this.canvas.height = this.height;
  this.gl.viewport(0, 0, this.width, this.height);
  this.quad = this.gl.createBuffer();
  this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quad);
  quad = new Float32Array([-1, -1, 0, 1, 1, -1, 0, 1, -1, 1, 0, 1, -1, 1, 0, 1, 1, -1, 0, 1, 1, 1, 0, 1]);
  this.gl.bufferData(this.gl.ARRAY_BUFFER, quad, this.gl.STATIC_DRAW);
  this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
  this.heights = new HeatmapHeights(this, this.gl, this.width, this.height);
}

WebGLHeatmap.prototype.adjustSize = function() {
  var canvasHeight, canvasWidth;
  canvasWidth = this.canvas.offsetWidth || 2;
  canvasHeight = this.canvas.offsetHeight || 2;
  if (this.width !== canvasWidth || this.height !== canvasHeight) {
    this.gl.viewport(0, 0, canvasWidth, canvasHeight);
    this.canvas.width = canvasWidth;
    this.canvas.height = canvasHeight;
    this.width = canvasWidth;
    this.height = canvasHeight;
    return this.heights.resize(this.width, this.height);
  }
};

WebGLHeatmap.prototype.display = function() {
  this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quad);
  this.gl.vertexAttribPointer(0, 4, this.gl.FLOAT, false, 0, 0);
  this.heights.nodeFront.bind(0);
  if (this.gradientTexture) {
    this.gradientTexture.bind(1);
  }
  this.shader.use().int('source', 0).int('gradientTexture', 1);
  return this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
};

WebGLHeatmap.prototype.update = function() {
  return this.heights.update();
};

WebGLHeatmap.prototype.clear = function() {
  return this.heights.clear();
};

WebGLHeatmap.prototype.clamp = function(min, max) {
  if (min == null) {
    min = 0;
  }
  if (max == null) {
    max = 1;
  }
  return this.heights.clamp(min, max);
};

WebGLHeatmap.prototype.multiply = function(value) {
  if (value == null) {
    value = 0.95;
  }
  return this.heights.multiply(value);
};

WebGLHeatmap.prototype.blur = function() {
  return this.heights.blur();
};

WebGLHeatmap.prototype.addPoint = function(x, y, size, intensity) {
  return this.heights.addPoint(x, y, size, intensity);
};

WebGLHeatmap.prototype.addPoints = function(items) {
  var item, _i, _len, _results;
  _results = [];
  for (_i = 0, _len = items.length; _i < _len; _i++) {
    item = items[_i];
    _results.push(this.addPoint(item.x, item.y, item.size, item.intensity));
  }
  return _results;
};

module.exports = WebGLHeatmap;


},{"./heatmap-heights":2,"./heatmap-shader":4,"./heatmap-texture":5,"global/document":9,"global/window":10,"path":11}]},{},[6])(6)
});

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJmcmFtZWJ1ZmZlci5qcyIsImlucHV0LmpzIiwiaGVhdG1hcC1ub2RlLmpzIiwiaGVhdG1hcC10ZXh0dXJlLmpzIiwibm9kZV9tb2R1bGVzL2Jyb3dzZXItcmVzb2x2ZS9lbXB0eS5qcyIsIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCJub2RlX21vZHVsZXMvZ2xvYmFsL2RvY3VtZW50LmpzIiwibm9kZV9tb2R1bGVzL2dsb2JhbC93aW5kb3cuanMiLCJub2RlX21vZHVsZXMvcGF0aC1icm93c2VyaWZ5L2luZGV4LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekRBLFlBQVksQ0FBQzs7QUFFYixJQUFJLGFBQWEsR0FBRyxPQUFPLENBQUMsa0JBQWtCLENBQUMsQ0FBQztBQUNoRCxBQUF1QjtBQUN2QixJQUFJLElBQUksR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7O0FBRTNCLElBQUksZ0JBQWdCLEdBQUcsc0lBQTJFLENBQUM7QUFDbkcsSUFBSSxrQkFBa0IsR0FBRyxxTkFBNkUsQ0FBQzs7QUFFdkcsSUFBSSxXQUFXLEdBQUcsT0FBTyxDQUFDLGdCQUFnQixDQUFDLENBQUM7O0FB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QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUN4TEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7OztBQ2pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7OztBQ2JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFD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Q0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0VBQ3hHLElBQUksQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsWUFBWSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDLFdBQVcsQ0FBQyxDQUFDO0VBQ3BFLElBQUksQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsWUFBWSxFQUFFLElBQUksQ0FBQyxDQUFDO0VBQy9DLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxjQUFjLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxFQUFFLEVBQUUsSUFBSSxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7Q0FDM0U7O0FBRUQsWUFBWSxDQUFDLFNBQVMsQ0FBQyxVQUFVLEdBQUcsV0FBVztFQUM3QyxJQUFJLFlBQVksRUFBRSxXQUFXLENBQUM7RUFDOUIsV0FBVyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxJQUFJLENBQUMsQ0FBQztFQUMzQyxZQUFZLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLElBQUksQ0FBQyxDQUFDO0VBQzdDLElBQUksSUFBSSxDQUFDLEtBQUssS0FBSyxXQUFXLElBQUksSUFBSSxDQUFDLE1BQU0sS0FBSyxZQUFZLEVBQUU7SUFDOUQsSUFBSSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxXQUFXLEVBQUUsWUFBWSxDQUFDLENBQUM7SUFDbEQsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFL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QUFHLFNBQVMsS0FBSyxFQUFFO0VBQ2pELElBQUksSUFBSSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDO0VBQzdCLFFBQVEsR0FBRyxFQUFFLENBQUM7RUFDZCxLQUFLLEVBQUUsR0FBRyxDQUFDLEVBQUUsSUFBSSxHQUFHLEtBQUssQ0FBQyxNQUFNLEVBQUUsRUFBRSxHQUFHLElBQUksRUFBRSxFQUFFLEVBQUUsRUFBRTtJQUNqRCxJQUFJLEdBQUcsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQ2pCLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztHQUN6RTtFQUNELE9BQU8sUUFBUSxDQUFDO0NBQ2pCLENBQUM7O0FBRUYsTUFBTSxDQUFDLE9BQU8sR0FBRyxZQUFZLENBQUMiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbigpe2Z1bmN0aW9uIHIoZSxuLHQpe2Z1bmN0aW9uIG8oaSxmKXtpZighbltpXSl7aWYoIWVbaV0pe3ZhciBjPVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmU7aWYoIWYmJmMpcmV0dXJuIGMoaSwhMCk7aWYodSlyZXR1cm4gdShpLCEwKTt2YXIgYT1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK2krXCInXCIpO3Rocm93IGEuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixhfXZhciBwPW5baV09e2V4cG9ydHM6e319O2VbaV1bMF0uY2FsbChwLmV4cG9ydHMsZnVuY3Rpb24ocil7dmFyIG49ZVtpXVsxXVtyXTtyZXR1cm4gbyhufHxyKX0scCxwLmV4cG9ydHMscixlLG4sdCl9cmV0dXJuIG5baV0uZXhwb3J0c31mb3IodmFyIHU9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZSxpPTA7aTx0Lmxlbmd0aDtpKyspbyh0W2ldKTtyZXR1cm4gb31yZXR1cm4gcn0pKCkiLCIndXNlIHN0cmljdCc7XG5cbmZ1bmN0aW9uIEZyYW1lYnVmZmVyKGdsKSB7XG4gIHRoaXMuZ2wgPSBnbDtcbiAgdGhpcy5idWZmZXIgPSB0aGlzLmdsLmNyZWF0ZUZyYW1lYnVmZmVyKCk7XG59XG5cbkZyYW1lYnVmZmVyLnByb3RvdHlwZS5kZXN0cm95ID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmdsLmRlbGV0ZUZSYW1lYnVmZmVyKHRoaXMuYnVmZmVyKTtcbn07XG5cbkZyYW1lYnVmZmVyLnByb3RvdHlwZS5iaW5kID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMuZ2wuYmluZEZyYW1lYnVmZmVyKHRoaXMuZ2wuRlJBTUVCVUZGRVIsIHRoaXMuYnVmZmVyKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5GcmFtZWJ1ZmZlci5wcm90b3R5cGUudW5iaW5kID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMuZ2wuYmluZEZyYW1lYnVmZmVyKHRoaXMuZ2wuRlJBTUVCVUZGRVIsIG51bGwpO1xuICByZXR1cm4gdGhpcztcbn07XG5cbkZyYW1lYnVmZmVyLnByb3RvdHlwZS5jaGVjayA9IGZ1bmN0aW9uKCkge1xuICB2YXIgcmVzdWx0O1xuICByZXN1bHQgPSB0aGlzLmdsLmNoZWNrRnJhbWVidWZmZXJTdGF0dXModGhpcy5nbC5GUkFNRUJVRkZFUik7XG4gIHN3aXRjaCAocmVzdWx0KSB7XG4gICAgY2FzZSB0aGlzLmdsLkZSQU1FQlVGRkVSX1VOU1VQUE9SVEVEOlxuICAgICAgdGhyb3cgJ0ZyYW1lYnVmZmVyIGlzIHVuc3VwcG9ydGVkJztcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgdGhpcy5nbC5GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX0FUVEFDSE1FTlQ6XG4gICAgICB0aHJvdyAnRnJhbWVidWZmZXIgaW5jb21wbGV0ZSBhdHRhY2htZW50JztcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgdGhpcy5nbC5GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX0RJTUVOU0lPTlM6XG4gICAgICB0aHJvdyAnRnJhbWVidWZmZXIgaW5jb21wbGV0ZSBkaW1lbnNpb25zJztcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgdGhpcy5nbC5GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX01JU1NJTkdfQVRUQUNITUVOVDpcbiAgICAgIHRocm93ICdGcmFtZWJ1ZmZlciBpbmNvbXBsZXRlIG1pc3NpbmcgYXR0YWNobWVudCc7XG4gIH1cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5GcmFtZWJ1ZmZlci5wcm90b3R5cGUuY29sb3IgPSBmdW5jdGlvbih0ZXh0dXJlKSB7XG4gIHRoaXMuZ2wuZnJhbWVidWZmZXJUZXh0dXJlMkQodGhpcy5nbC5GUkFNRUJVRkZFUiwgdGhpcy5nbC5DT0xPUl9BVFRBQ0hNRU5UMCwgdGV4dHVyZS50YXJnZXQsIHRleHR1cmUuaGFuZGxlLCAwKTtcbiAgdGhpcy5jaGVjaygpO1xuICByZXR1cm4gdGhpcztcbn07XG5cbkZyYW1lYnVmZmVyLnByb3RvdHlwZS5kZXB0aCA9IGZ1bmN0aW9uKGJ1ZmZlcikge1xuICB0aGlzLmdsLmZyYW1lYnVmZmVyUmVuZGVyYnVmZmVyKHRoaXMuZ2wuRlJBTUVCVUZGRVIsIHRoaXMuZ2wuREVQVEhfQVRUQUNITUVOVCwgdGhpcy5nbC5SRU5ERVJCVUZGRVIsIGJ1ZmZlci5pZCk7XG4gIHRoaXMuY2hlY2soKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5GcmFtZWJ1ZmZlci5wcm90b3R5cGUuZGVzdHJveSA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5nbC5kZWxldGVGcmFtZWJ1ZmZlcih0aGlzLmJ1ZmZlcik7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEZyYW1lYnVmZmVyO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgZG9jdW1lbnQgPSByZXF1aXJlKCdnbG9iYWwvZG9jdW1lbnQnKTtcbnZhciB3aW5kb3cgPSByZXF1aXJlKCdnbG9iYWwvd2luZG93Jyk7XG52YXIgZnMgPSByZXF1aXJlKCdmcycpO1xudmFyIHBhdGggPSByZXF1aXJlKCdwYXRoJyk7XG4vKiBlc2xpbnQtZGlzYWJsZSBtYXgtbGVuICovXG52YXIgdmVydGV4U2hhZGVyQmxpdCA9IGZzLnJlYWRGaWxlU3luYyhwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi92ZXJ0ZXgtc2hhZGVyLWJsaXQuZ2xzbCcpLCAndXRmLTgnKTtcbnZhciBmcmFnbWVudFNoYWRlckJsaXQgPSBmcy5yZWFkRmlsZVN5bmMocGF0aC5qb2luKF9fZGlybmFtZSwgJy4vZnJhZ21lbnQtc2hhZGVyLWJsaXQuZ2xzbCcpLCAndXRmLTgnKTtcbi8qIGVzbGludC1lbmFibGUgbWF4LWxlbiAqL1xudmFyIEhlYXRtYXBUZXh0dXJlID0gcmVxdWlyZSgnLi9oZWF0bWFwLXRleHR1cmUnKTtcbnZhciBIZWF0bWFwSGVpZ2h0cyA9IHJlcXVpcmUoJy4vaGVhdG1hcC1oZWlnaHRzJyk7XG52YXIgSGVhdG1hcFNoYWRlciA9IHJlcXVpcmUoJy4vaGVhdG1hcC1zaGFkZXInKTtcblxuZnVuY3Rpb24gV2ViR0xIZWF0bWFwKF9hcmcpIHtcbiAgdmFyIGFscGhhRW5kLCBhbHBoYVJhbmdlLCBhbHBoYVN0YXJ0LCBlcnJvciwgZ2V0Q29sb3JGdW4sIGdyYWRpZW50VGV4dHVyZSwgaW1hZ2UsIGludGVuc2l0eVRvQWxwaGEsIG91dHB1dCwgcXVhZCwgdGV4dHVyZUdyYWRpZW50LCBfcmVmLCBfcmVmMTtcbiAgX3JlZiA9IF9hcmcgIT0gbnVsbCA/IF9hcmcgOiB7fSwgdGhpcy5jYW52YXMgPSBfcmVmLmNhbnZhcywgdGhpcy53aWR0aCA9IF9yZWYud2lkdGgsIHRoaXMuaGVpZ2h0ID0gX3JlZi5oZWlnaHQsIGludGVuc2l0eVRvQWxwaGEgPSBfcmVmLmludGVuc2l0eVRvQWxwaGEsIGdyYWRpZW50VGV4dHVyZSA9IF9yZWYuZ3JhZGllbnRUZXh0dXJlLCBhbHBoYVJhbmdlID0gX3JlZi5hbHBoYVJhbmdlO1xuICBpZiAoIXRoaXMuY2FudmFzKSB7XG4gICAgdGhpcy5jYW52YXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKTtcbiAgfVxuICB0cnkge1xuICAgIHRoaXMuZ2wgPSB0aGlzLmNhbnZhcy5nZXRDb250ZXh0KCdleHBlcmltZW50YWwtd2ViZ2wnLCB7XG4gICAgICBkZXB0aDogZmFsc2UsXG4gICAgICBhbnRpYWxpYXM6IGZhbHNlXG4gICAgfSk7XG4gICAgaWYgKHRoaXMuZ2wgPT09IG51bGwpIHtcbiAgICAgIHRoaXMuZ2wgPSB0aGlzLmNhbnZhcy5nZXRDb250ZXh0KCd3ZWJnbCcsIHtcbiAgICAgICAgZGVwdGg6IGZhbHNlLFxuICAgICAgICBhbnRpYWxpYXM6IGZhbHNlXG4gICAgICB9KTtcbiAgICAgIGlmICh0aGlzLmdsID09PSBudWxsKSB7XG4gICAgICAgIHRocm93ICdXZWJHTCBub3Qgc3VwcG9ydGVkJztcbiAgICAgIH1cbiAgICB9XG4gIH0gY2F0Y2ggKF9lcnJvcikge1xuICAgIGVycm9yID0gX2Vycm9yO1xuICAgIHRocm93ICdXZWJHTCBub3Qgc3VwcG9ydGVkJztcbiAgfVxuICBpZiAod2luZG93LldlYkdMRGVidWdVdGlscyAhPSBudWxsKSB7XG4gICAgY29uc29sZS5sb2coJ2RlYnVnZ2luZyBtb2RlJyk7XG4gICAgdGhpcy5nbCA9IFdlYkdMRGVidWdVdGlscy5tYWtlRGVidWdDb250ZXh0KHRoaXMuZ2wsIGZ1bmN0aW9uKGVyciwgZnVuY05hbWUsIGFyZ3MpIHtcbiAgICAgIHRocm93IFdlYkdMRGVidWdVdGlscy5nbEVudW1Ub1N0cmluZyhlcnIpICsgXCIgd2FzIGNhdXNlZCBieSBjYWxsIHRvOiBcIiArIGZ1bmNOYW1lO1xuICAgIH0pO1xuICB9XG4gIHRoaXMuZ2wuZW5hYmxlVmVydGV4QXR0cmliQXJyYXkoMCk7XG4gIHRoaXMuZ2wuYmxlbmRGdW5jKHRoaXMuZ2wuT05FLCB0aGlzLmdsLk9ORSk7XG4gIGlmIChncmFkaWVudFRleHR1cmUpIHtcbiAgICB0ZXh0dXJlR3JhZGllbnQgPSB0aGlzLmdyYWRpZW50VGV4dHVyZSA9IG5ldyBIZWF0bWFwVGV4dHVyZSh0aGlzLmdsLCB7XG4gICAgICBjaGFubmVsczogJ3JnYmEnXG4gICAgfSkuYmluZCgwKS5zZXRTaXplKDIsIDIpLm5lYXJlc3QoKS5jbGFtcFRvRWRnZSgpO1xuICAgIGlmICh0eXBlb2YgZ3JhZGllbnRUZXh0dXJlID09PSAnc3RyaW5nJykge1xuICAgICAgaW1hZ2UgPSBuZXcgd2luZG93LkltYWdlKCk7XG4gICAgICBpbWFnZS5vbmxvYWQgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRleHR1cmVHcmFkaWVudC5iaW5kKCkudXBsb2FkKGltYWdlKTtcbiAgICAgIH07XG4gICAgICBpbWFnZS5zcmMgPSBncmFkaWVudFRleHR1cmU7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChncmFkaWVudFRleHR1cmUud2lkdGggPiAwICYmIGdyYWRpZW50VGV4dHVyZS5oZWlnaHQgPiAwKSB7XG4gICAgICAgIHRleHR1cmVHcmFkaWVudC51cGxvYWQoZ3JhZGllbnRUZXh0dXJlKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGdyYWRpZW50VGV4dHVyZS5vbmxvYWQgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICByZXR1cm4gdGV4dHVyZUdyYWRpZW50LnVwbG9hZChncmFkaWVudFRleHR1cmUpO1xuICAgICAgICB9O1xuICAgICAgfVxuICAgIH1cbiAgICBnZXRDb2xvckZ1biA9ICd1bmlmb3JtIHNhbXBsZXIyRCBncmFkaWVudFRleHR1cmU7XFxudmVjMyBnZXRDb2xvcihmbG9hdCBpbnRlbnNpdHkpe1xcbiAgICByZXR1cm4gdGV4dHVyZTJEKGdyYWRpZW50VGV4dHVyZSwgdmVjMihpbnRlbnNpdHksIDAuMCkpLnJnYjtcXG59JztcbiAgfSBlbHNlIHtcbiAgICB0ZXh0dXJlR3JhZGllbnQgPSBudWxsO1xuICAgIGdldENvbG9yRnVuID0gJ3ZlYzMgZ2V0Q29sb3IoZmxvYXQgaW50ZW5zaXR5KXtcXG4gICAgdmVjMyBibHVlID0gdmVjMygwLjAsIDAuMCwgMS4wKTtcXG4gICAgdmVjMyBjeWFuID0gdmVjMygwLjAsIDEuMCwgMS4wKTtcXG4gICAgdmVjMyBncmVlbiA9IHZlYzMoMC4wLCAxLjAsIDAuMCk7XFxuICAgIHZlYzMgeWVsbG93ID0gdmVjMygxLjAsIDEuMCwgMC4wKTtcXG4gICAgdmVjMyByZWQgPSB2ZWMzKDEuMCwgMC4wLCAwLjApO1xcblxcbiAgICB2ZWMzIGNvbG9yID0gKFxcbiAgICAgICAgZmFkZSgtMC4yNSwgMC4yNSwgaW50ZW5zaXR5KSpibHVlICtcXG4gICAgICAgIGZhZGUoMC4wLCAwLjUsIGludGVuc2l0eSkqY3lhbiArXFxuICAgICAgICBmYWRlKDAuMjUsIDAuNzUsIGludGVuc2l0eSkqZ3JlZW4gK1xcbiAgICAgICAgZmFkZSgwLjUsIDEuMCwgaW50ZW5zaXR5KSp5ZWxsb3cgK1xcbiAgICAgICAgc21vb3Roc3RlcCgwLjc1LCAxLjAsIGludGVuc2l0eSkqcmVkXFxuICAgICk7XFxuICAgIHJldHVybiBjb2xvcjtcXG59JztcbiAgfVxuICBpZiAoaW50ZW5zaXR5VG9BbHBoYSA9PSBudWxsKSB7XG4gICAgaW50ZW5zaXR5VG9BbHBoYSA9IHRydWU7XG4gIH1cbiAgaWYgKGludGVuc2l0eVRvQWxwaGEpIHtcbiAgICBfcmVmMSA9IGFscGhhUmFuZ2UgIT0gbnVsbCA/IGFscGhhUmFuZ2UgOiBbMCwgMV0sIGFscGhhU3RhcnQgPSBfcmVmMVswXSwgYWxwaGFFbmQgPSBfcmVmMVsxXTtcbiAgICBvdXRwdXQgPSBcInZlYzQgYWxwaGFGdW4odmVjMyBjb2xvciwgZmxvYXQgaW50ZW5zaXR5KXtcXG4gICAgZmxvYXQgYWxwaGEgPSBzbW9vdGhzdGVwKFwiICsgKGFscGhhU3RhcnQudG9GaXhlZCg4KSkgKyBcIiwgXCIgKyAoYWxwaGFFbmQudG9GaXhlZCg4KSkgKyBcIiwgaW50ZW5zaXR5KTtcXG4gICAgcmV0dXJuIHZlYzQoY29sb3IqYWxwaGEsIGFscGhhKTtcXG59XCI7XG4gIH0gZWxzZSB7XG4gICAgb3V0cHV0ID0gJ3ZlYzQgYWxwaGFGdW4odmVjMyBjb2xvciwgZmxvYXQgaW50ZW5zaXR5KXtcXG4gICAgcmV0dXJuIHZlYzQoY29sb3IsIDEuMCk7XFxufSc7XG4gIH1cbiAgdGhpcy5zaGFkZXIgPSBuZXcgSGVhdG1hcFNoYWRlcih0aGlzLmdsLCB7XG4gICAgdmVydGV4OiB2ZXJ0ZXhTaGFkZXJCbGl0LFxuICAgIGZyYWdtZW50OiBmcmFnbWVudFNoYWRlckJsaXQgKyAoXCJmbG9hdCBsaW5zdGVwKGZsb2F0IGxvdywgZmxvYXQgaGlnaCwgZmxvYXQgdmFsdWUpe1xcbiAgICByZXR1cm4gY2xhbXAoKHZhbHVlLWxvdykvKGhpZ2gtbG93KSwgMC4wLCAxLjApO1xcbn1cXG5cXG5mbG9hdCBmYWRlKGZsb2F0IGxvdywgZmxvYXQgaGlnaCwgZmxvYXQgdmFsdWUpe1xcbiAgICBmbG9hdCBtaWQgPSAobG93K2hpZ2gpKjAuNTtcXG4gICAgZmxvYXQgcmFuZ2UgPSAoaGlnaC1sb3cpKjAuNTtcXG4gICAgZmxvYXQgeCA9IDEuMCAtIGNsYW1wKGFicyhtaWQtdmFsdWUpL3JhbmdlLCAwLjAsIDEuMCk7XFxuICAgIHJldHVybiBzbW9vdGhzdGVwKDAuMCwgMS4wLCB4KTtcXG59XFxuXFxuXCIgKyBnZXRDb2xvckZ1biArIFwiXFxuXCIgKyBvdXRwdXQgKyBcIlxcblxcbnZvaWQgbWFpbigpe1xcbiAgICBmbG9hdCBpbnRlbnNpdHkgPSBzbW9vdGhzdGVwKDAuMCwgMS4wLCB0ZXh0dXJlMkQoc291cmNlLCB0ZXhjb29yZCkucik7XFxuICAgIHZlYzMgY29sb3IgPSBnZXRDb2xvcihpbnRlbnNpdHkpO1xcbiAgICBnbF9GcmFnQ29sb3IgPSBhbHBoYUZ1bihjb2xvciwgaW50ZW5zaXR5KTtcXG59XCIpXG4gIH0pO1xuICBpZiAodGhpcy53aWR0aCA9PSBudWxsKSB7XG4gICAgdGhpcy53aWR0aCA9IHRoaXMuY2FudmFzLm9mZnNldFdpZHRoIHx8IDI7XG4gIH1cbiAgaWYgKHRoaXMuaGVpZ2h0ID09IG51bGwpIHtcbiAgICB0aGlzLmhlaWdodCA9IHRoaXMuY2FudmFzLm9mZnNldEhlaWdodCB8fCAyO1xuICB9XG4gIHRoaXMuY2FudmFzLndpZHRoID0gdGhpcy53aWR0aDtcbiAgdGhpcy5jYW52YXMuaGVpZ2h0ID0gdGhpcy5oZWlnaHQ7XG4gIHRoaXMuZ2wudmlld3BvcnQoMCwgMCwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xuICB0aGlzLnF1YWQgPSB0aGlzLmdsLmNyZWF0ZUJ1ZmZlcigpO1xuICB0aGlzLmdsLmJpbmRCdWZmZXIodGhpcy5nbC5BUlJBWV9CVUZGRVIsIHRoaXMucXVhZCk7XG4gIHF1YWQgPSBuZXcgRmxvYXQzMkFycmF5KFstMSwgLTEsIDAsIDEsIDEsIC0xLCAwLCAxLCAtMSwgMSwgMCwgMSwgLTEsIDEsIDAsIDEsIDEsIC0xLCAwLCAxLCAxLCAxLCAwLCAxXSk7XG4gIHRoaXMuZ2wuYnVmZmVyRGF0YSh0aGlzLmdsLkFSUkFZX0JVRkZFUiwgcXVhZCwgdGhpcy5nbC5TVEFUSUNfRFJBVyk7XG4gIHRoaXMuZ2wuYmluZEJ1ZmZlcih0aGlzLmdsLkFSUkFZX0JVRkZFUiwgbnVsbCk7XG4gIHRoaXMuaGVpZ2h0cyA9IG5ldyBIZWF0bWFwSGVpZ2h0cyh0aGlzLCB0aGlzLmdsLCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XG59XG5cbldlYkdMSGVhdG1hcC5wcm90b3R5cGUuYWRqdXN0U2l6ZSA9IGZ1bmN0aW9uKCkge1xuICB2YXIgY2FudmFzSGVpZ2h0LCBjYW52YXNXaWR0aDtcbiAgY2FudmFzV2lkdGggPSB0aGlzLmNhbnZhcy5vZmZzZXRXaWR0aCB8fCAyO1xuICBjYW52YXNIZWlnaHQgPSB0aGlzLmNhbnZhcy5vZmZzZXRIZWlnaHQgfHwgMjtcbiAgaWYgKHRoaXMud2lkdGggIT09IGNhbnZhc1dpZHRoIHx8IHRoaXMuaGVpZ2h0ICE9PSBjYW52YXNIZWlnaHQpIHtcbiAgICB0aGlzLmdsLnZpZXdwb3J0KDAsIDAsIGNhbnZhc1dpZHRoLCBjYW52YXNIZWlnaHQpO1xuICAgIHRoaXMuY2FudmFzLndpZHRoID0gY2FudmFzV2lkdGg7XG4gICAgdGhpcy5jYW52YXMuaGVpZ2h0ID0gY2FudmFzSGVpZ2h0O1xuICAgIHRoaXMud2lkdGggPSBjYW52YXNXaWR0aDtcbiAgICB0aGlzLmhlaWdodCA9IGNhbnZhc0hlaWdodDtcbiAgICByZXR1cm4gdGhpcy5oZWlnaHRzLnJlc2l6ZSh0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XG4gIH1cbn07XG5cbldlYkdMSGVhdG1hcC5wcm90b3R5cGUuZGlzcGxheSA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLmdsLmJpbmRCdWZmZXIodGhpcy5nbC5BUlJBWV9CVUZGRVIsIHRoaXMucXVhZCk7XG4gIHRoaXMuZ2wudmVydGV4QXR0cmliUG9pbnRlcigwLCA0LCB0aGlzLmdsLkZMT0FULCBmYWxzZSwgMCwgMCk7XG4gIHRoaXMuaGVpZ2h0cy5ub2RlRnJvbnQuYmluZCgwKTtcbiAgaWYgKHRoaXMuZ3JhZGllbnRUZXh0dXJlKSB7XG4gICAgdGhpcy5ncmFkaWVudFRleHR1cmUuYmluZCgxKTtcbiAgfVxuICB0aGlzLnNoYWRlci51c2UoKS5pbnQoJ3NvdXJjZScsIDApLmludCgnZ3JhZGllbnRUZXh0dXJlJywgMSk7XG4gIHJldHVybiB0aGlzLmdsLmRyYXdBcnJheXModGhpcy5nbC5UUklBTkdMRVMsIDAsIDYpO1xufTtcblxuV2ViR0xIZWF0bWFwLnByb3RvdHlwZS51cGRhdGUgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuaGVpZ2h0cy51cGRhdGUoKTtcbn07XG5cbldlYkdMSGVhdG1hcC5wcm90b3R5cGUuY2xlYXIgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuaGVpZ2h0cy5jbGVhcigpO1xufTtcblxuV2ViR0xIZWF0bWFwLnByb3RvdHlwZS5jbGFtcCA9IGZ1bmN0aW9uKG1pbiwgbWF4KSB7XG4gIGlmIChtaW4gPT0gbnVsbCkge1xuICAgIG1pbiA9IDA7XG4gIH1cbiAgaWYgKG1heCA9PSBudWxsKSB7XG4gICAgbWF4ID0gMTtcbiAgfVxuICByZXR1cm4gdGhpcy5oZWlnaHRzLmNsYW1wKG1pbiwgbWF4KTtcbn07XG5cbldlYkdMSGVhdG1hcC5wcm90b3R5cGUubXVsdGlwbHkgPSBmdW5jdGlvbih2YWx1ZSkge1xuICBpZiAodmFsdWUgPT0gbnVsbCkge1xuICAgIHZhbHVlID0gMC45NTtcbiAgfVxuICByZXR1cm4gdGhpcy5oZWlnaHRzLm11bHRpcGx5KHZhbHVlKTtcbn07XG5cbldlYkdMSGVhdG1hcC5wcm90b3R5cGUuYmx1ciA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5oZWlnaHRzLmJsdXIoKTtcbn07XG5cbldlYkdMSGVhdG1hcC5wcm90b3R5cGUuYWRkUG9pbnQgPSBmdW5jdGlvbih4LCB5LCBzaXplLCBpbnRlbnNpdHkpIHtcbiAgcmV0dXJuIHRoaXMuaGVpZ2h0cy5hZGRQb2ludCh4LCB5LCBzaXplLCBpbnRlbnNpdHkpO1xufTtcblxuV2ViR0xIZWF0bWFwLnByb3RvdHlwZS5hZGRQb2ludHMgPSBmdW5jdGlvbihpdGVtcykge1xuICB2YXIgaXRlbSwgX2ksIF9sZW4sIF9yZXN1bHRzO1xuICBfcmVzdWx0cyA9IFtdO1xuICBmb3IgKF9pID0gMCwgX2xlbiA9IGl0ZW1zLmxlbmd0aDsgX2kgPCBfbGVuOyBfaSsrKSB7XG4gICAgaXRlbSA9IGl0ZW1zW19pXTtcbiAgICBfcmVzdWx0cy5wdXNoKHRoaXMuYWRkUG9pbnQoaXRlbS54LCBpdGVtLnksIGl0ZW0uc2l6ZSwgaXRlbS5pbnRlbnNpdHkpKTtcbiAgfVxuICByZXR1cm4gX3Jlc3VsdHM7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFdlYkdMSGVhdG1hcDtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIEhlYXRtYXBUZXh0dXJlID0gcmVxdWlyZSgnLi9oZWF0bWFwLXRleHR1cmUnKTtcbnZhciBGcmFtZWJ1ZmZlciA9IHJlcXVpcmUoJy4vZnJhbWVidWZmZXInKTtcblxuZnVuY3Rpb24gSGVhdG1hcE5vZGUoZ2wsIHdpZHRoLCBoZWlnaHQpIHtcbiAgdmFyIGZsb2F0RXh0O1xuICB0aGlzLmdsID0gZ2w7XG4gIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG4gIGZsb2F0RXh0ID0gdGhpcy5nbC5nZXRGbG9hdEV4dGVuc2lvbih7XG4gICAgcmVxdWlyZTogWydyZW5kZXJhYmxlJ11cbiAgfSk7XG4gIHRoaXMudGV4dHVyZSA9IG5ldyBIZWF0bWFwVGV4dHVyZSh0aGlzLmdsLCB7XG4gICAgdHlwZTogZmxvYXRFeHQudHlwZVxuICB9KS5iaW5kKDApLnNldFNpemUodGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpLm5lYXJlc3QoKS5jbGFtcFRvRWRnZSgpO1xuICB0aGlzLmZibyA9IG5ldyBGcmFtZWJ1ZmZlcih0aGlzLmdsKS5iaW5kKCkuY29sb3IodGhpcy50ZXh0dXJlKS51bmJpbmQoKTtcbn1cblxuSGVhdG1hcE5vZGUucHJvdG90eXBlLnVzZSA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5mYm8uYmluZCgpO1xufTtcblxuSGVhdG1hcE5vZGUucHJvdG90eXBlLmJpbmQgPSBmdW5jdGlvbih1bml0KSB7XG4gIHJldHVybiB0aGlzLnRleHR1cmUuYmluZCh1bml0KTtcbn07XG5cbkhlYXRtYXBOb2RlLnByb3RvdHlwZS5lbmQgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuZmJvLnVuYmluZCgpO1xufTtcblxuSGVhdG1hcE5vZGUucHJvdG90eXBlLnJlc2l6ZSA9IGZ1bmN0aW9uKHdpZHRoLCBoZWlnaHQpIHtcbiAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICB0aGlzLmhlaWdodCA9IGhlaWdodDtcbiAgcmV0dXJuIHRoaXMudGV4dHVyZS5iaW5kKDApLnNldFNpemUodGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBIZWF0bWFwTm9kZTtcbiIsIid1c2Ugc3RyaWN0JztcblxuZnVuY3Rpb24gSGVhdG1hcFRleHR1cmUoZ2wsIHBhcmFtcykge1xuICB2YXIgX3JlZiwgX3JlZjE7XG4gIHRoaXMuZ2wgPSBnbDtcbiAgaWYgKHBhcmFtcyA9PSBudWxsKSB7XG4gICAgcGFyYW1zID0ge307XG4gIH1cbiAgdGhpcy5jaGFubmVscyA9IHRoaXMuZ2xbKChfcmVmID0gcGFyYW1zLmNoYW5uZWxzKSAhPSBudWxsID8gX3JlZiA6ICdyZ2JhJykudG9VcHBlckNhc2UoKV07XG4gIGlmICh0eXBlb2YgcGFyYW1zLnR5cGUgPT09ICdudW1iZXInKSB7XG4gICAgdGhpcy50eXBlID0gcGFyYW1zLnR5cGU7XG4gIH0gZWxzZSB7XG4gICAgdGhpcy50eXBlID0gdGhpcy5nbFsoKF9yZWYxID0gcGFyYW1zLnR5cGUpICE9IG51bGwgPyBfcmVmMSA6ICd1bnNpZ25lZF9ieXRlJykudG9VcHBlckNhc2UoKV07XG4gIH1cbiAgc3dpdGNoICh0aGlzLmNoYW5uZWxzKSB7XG4gICAgY2FzZSB0aGlzLmdsLlJHQkE6XG4gICAgICB0aGlzLmNoYW5jb3VudCA9IDQ7XG4gICAgICBicmVhaztcbiAgICBjYXNlIHRoaXMuZ2wuUkdCOlxuICAgICAgdGhpcy5jaGFuY291bnQgPSAzO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSB0aGlzLmdsLkxVTUlOQU5DRV9BTFBIQTpcbiAgICAgIHRoaXMuY2hhbmNvdW50ID0gMjtcbiAgICAgIGJyZWFrO1xuICAgIGRlZmF1bHQ6XG4gICAgICB0aGlzLmNoYW5jb3VudCA9IDE7XG4gIH1cbiAgdGhpcy50YXJnZXQgPSB0aGlzLmdsLlRFWFRVUkVfMkQ7XG4gIHRoaXMuaGFuZGxlID0gdGhpcy5nbC5jcmVhdGVUZXh0dXJlKCk7XG59XG5cbkhlYXRtYXBUZXh0dXJlLnByb3RvdHlwZS5kZXN0cm95ID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmdsLmRlbGV0ZVRleHR1cmUodGhpcy5oYW5kbGUpO1xufTtcblxuSGVhdG1hcFRleHR1cmUucHJvdG90eXBlLmJpbmQgPSBmdW5jdGlvbih1bml0KSB7XG4gIGlmICh1bml0ID09IG51bGwpIHtcbiAgICB1bml0ID0gMDtcbiAgfVxuICBpZiAodW5pdCA+IDE1KSB7XG4gICAgdGhyb3cgJ1RleHR1cmUgdW5pdCB0b28gbGFyZ2U6ICcgKyB1bml0O1xuICB9XG4gIHRoaXMuZ2wuYWN0aXZlVGV4dHVyZSh0aGlzLmdsLlRFWFRVUkUwICsgdW5pdCk7XG4gIHRoaXMuZ2wuYmluZFRleHR1cmUodGhpcy50YXJnZXQsIHRoaXMuaGFuZGxlKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5IZWF0bWFwVGV4dHVyZS5wcm90b3R5cGUuc2V0U2l6ZSA9IGZ1bmN0aW9uKHdpZHRoLCBoZWlnaHQpIHtcbiAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICB0aGlzLmhlaWdodCA9IGhlaWdodDtcbiAgdGhpcy5nbC50ZXhJbWFnZTJEKHRoaXMudGFyZ2V0LCAwLCB0aGlzLmNoYW5uZWxzLCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCwgMCwgdGhpcy5jaGFubmVscywgdGhpcy50eXBlLCBudWxsKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5IZWF0bWFwVGV4dHVyZS5wcm90b3R5cGUudXBsb2FkID0gZnVuY3Rpb24oZGF0YSkge1xuICB0aGlzLndpZHRoID0gZGF0YS53aWR0aDtcbiAgdGhpcy5oZWlnaHQgPSBkYXRhLmhlaWdodDtcbiAgdGhpcy5nbC50ZXhJbWFnZTJEKHRoaXMudGFyZ2V0LCAwLCB0aGlzLmNoYW5uZWxzLCB0aGlzLmNoYW5uZWxzLCB0aGlzLnR5cGUsIGRhdGEpO1xuICByZXR1cm4gdGhpcztcbn07XG5cbkhlYXRtYXBUZXh0dXJlLnByb3RvdHlwZS5saW5lYXIgPSBmdW5jdGlvbigpIHtcbiAgdGhpcy5nbC50ZXhQYXJhbWV0ZXJpKHRoaXMudGFyZ2V0LCB0aGlzLmdsLlRFWFRVUkVfTUFHX0ZJTFRFUiwgdGhpcy5nbC5MSU5FQVIpO1xuICB0aGlzLmdsLnRleFBhcmFtZXRlcmkodGhpcy50YXJnZXQsIHRoaXMuZ2wuVEVYVFVSRV9NSU5fRklMVEVSLCB0aGlzLmdsLkxJTkVBUik7XG4gIHJldHVybiB0aGlzO1xufTtcblxuSGVhdG1hcFRleHR1cmUucHJvdG90eXBlLm5lYXJlc3QgPSBmdW5jdGlvbigpIHtcbiAgdGhpcy5nbC50ZXhQYXJhbWV0ZXJpKHRoaXMudGFyZ2V0LCB0aGlzLmdsLlRFWFRVUkVfTUFHX0ZJTFRFUiwgdGhpcy5nbC5ORUFSRVNUKTtcbiAgdGhpcy5nbC50ZXhQYXJhbWV0ZXJpKHRoaXMudGFyZ2V0LCB0aGlzLmdsLlRFWFRVUkVfTUlOX0ZJTFRFUiwgdGhpcy5nbC5ORUFSRVNUKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5IZWF0bWFwVGV4dHVyZS5wcm90b3R5cGUuY2xhbXBUb0VkZ2UgPSBmdW5jdGlvbigpIHtcbiAgdGhpcy5nbC50ZXhQYXJhbWV0ZXJpKHRoaXMudGFyZ2V0LCB0aGlzLmdsLlRFWFRVUkVfV1JBUF9TLCB0aGlzLmdsLkNMQU1QX1RPX0VER0UpO1xuICB0aGlzLmdsLnRleFBhcmFtZXRlcmkodGhpcy50YXJnZXQsIHRoaXMuZ2wuVEVYVFVSRV9XUkFQX1QsIHRoaXMuZ2wuQ0xBTVBfVE9fRURHRSk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuSGVhdG1hcFRleHR1cmUucHJvdG90eXBlLnJlcGVhdCA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLmdsLnRleFBhcmFtZXRlcmkodGhpcy50YXJnZXQsIHRoaXMuZ2wuVEVYVFVSRV9XUkFQX1MsIHRoaXMuZ2wuUkVQRUFUKTtcbiAgdGhpcy5nbC50ZXhQYXJhbWV0ZXJpKHRoaXMudGFyZ2V0LCB0aGlzLmdsLlRFWFRVUkVfV1JBUF9ULCB0aGlzLmdsLlJFUEVBVCk7XG4gIHJldHVybiB0aGlzO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBIZWF0bWFwVGV4dHVyZTtcbiIsIiIsIi8vIHNoaW0gZm9yIHVzaW5nIHByb2Nlc3MgaW4gYnJvd3NlclxudmFyIHByb2Nlc3MgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xuXG4vLyBjYWNoZWQgZnJvbSB3aGF0ZXZlciBnbG9iYWwgaXMgcHJlc2VudCBzbyB0aGF0IHRlc3QgcnVubmVycyB0aGF0IHN0dWIgaXRcbi8vIGRvbid0IGJyZWFrIHRoaW5ncy4gIEJ1dCB3ZSBuZWVkIHRvIHdyYXAgaXQgaW4gYSB0cnkgY2F0Y2ggaW4gY2FzZSBpdCBpc1xuLy8gd3JhcHBlZCBpbiBzdHJpY3QgbW9kZSBjb2RlIHdoaWNoIGRvZXNuJ3QgZGVmaW5lIGFueSBnbG9iYWxzLiAgSXQncyBpbnNpZGUgYVxuLy8gZnVuY3Rpb24gYmVjYXVzZSB0cnkvY2F0Y2hlcyBkZW9wdGltaXplIGluIGNlcnRhaW4gZW5naW5lcy5cblxudmFyIGNhY2hlZFNldFRpbWVvdXQ7XG52YXIgY2FjaGVkQ2xlYXJUaW1lb3V0O1xuXG5mdW5jdGlvbiBkZWZhdWx0U2V0VGltb3V0KCkge1xuICAgIHRocm93IG5ldyBFcnJvcignc2V0VGltZW91dCBoYXMgbm90IGJlZW4gZGVmaW5lZCcpO1xufVxuZnVuY3Rpb24gZGVmYXVsdENsZWFyVGltZW91dCAoKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdjbGVhclRpbWVvdXQgaGFzIG5vdCBiZWVuIGRlZmluZWQnKTtcbn1cbihmdW5jdGlvbiAoKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgaWYgKHR5cGVvZiBzZXRUaW1lb3V0ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICBjYWNoZWRTZXRUaW1lb3V0ID0gc2V0VGltZW91dDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNhY2hlZFNldFRpbWVvdXQgPSBkZWZhdWx0U2V0VGltb3V0O1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjYWNoZWRTZXRUaW1lb3V0ID0gZGVmYXVsdFNldFRpbW91dDtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgICAgaWYgKHR5cGVvZiBjbGVhclRpbWVvdXQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIGNhY2hlZENsZWFyVGltZW91dCA9IGNsZWFyVGltZW91dDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNhY2hlZENsZWFyVGltZW91dCA9IGRlZmF1bHRDbGVhclRpbWVvdXQ7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNhY2hlZENsZWFyVGltZW91dCA9IGRlZmF1bHRDbGVhclRpbWVvdXQ7XG4gICAgfVxufSAoKSlcbmZ1bmN0aW9uIHJ1blRpbWVvdXQoZnVuKSB7XG4gICAgaWYgKGNhY2hlZFNldFRpbWVvdXQgPT09IHNldFRpbWVvdXQpIHtcbiAgICAgICAgLy9ub3JtYWwgZW52aXJvbWVudHMgaW4gc2FuZSBzaXR1YXRpb25zXG4gICAgICAgIHJldHVybiBzZXRUaW1lb3V0KGZ1biwgMCk7XG4gICAgfVxuICAgIC8vIGlmIHNldFRpbWVvdXQgd2Fzbid0IGF2YWlsYWJsZSBidXQgd2FzIGxhdHRlciBkZWZpbmVkXG4gICAgaWYgKChjYWNoZWRTZXRUaW1lb3V0ID09PSBkZWZhdWx0U2V0VGltb3V0IHx8ICFjYWNoZWRTZXRUaW1lb3V0KSAmJiBzZXRUaW1lb3V0KSB7XG4gICAgICAgIGNhY2hlZFNldFRpbWVvdXQgPSBzZXRUaW1lb3V0O1xuICAgICAgICByZXR1cm4gc2V0VGltZW91dChmdW4sIDApO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgICAvLyB3aGVuIHdoZW4gc29tZWJvZHkgaGFzIHNjcmV3ZWQgd2l0aCBzZXRUaW1lb3V0IGJ1dCBubyBJLkUuIG1hZGRuZXNzXG4gICAgICAgIHJldHVybiBjYWNoZWRTZXRUaW1lb3V0KGZ1biwgMCk7XG4gICAgfSBjYXRjaChlKXtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIFdoZW4gd2UgYXJlIGluIEkuRS4gYnV0IHRoZSBzY3JpcHQgaGFzIGJlZW4gZXZhbGVkIHNvIEkuRS4gZG9lc24ndCB0cnVzdCB0aGUgZ2xvYmFsIG9iamVjdCB3aGVuIGNhbGxlZCBub3JtYWxseVxuICAgICAgICAgICAgcmV0dXJuIGNhY2hlZFNldFRpbWVvdXQuY2FsbChudWxsLCBmdW4sIDApO1xuICAgICAgICB9IGNhdGNoKGUpe1xuICAgICAgICAgICAgLy8gc2FtZSBhcyBhYm92ZSBidXQgd2hlbiBpdCdzIGEgdmVyc2lvbiBvZiBJLkUuIHRoYXQgbXVzdCBoYXZlIHRoZSBnbG9iYWwgb2JqZWN0IGZvciAndGhpcycsIGhvcGZ1bGx5IG91ciBjb250ZXh0IGNvcnJlY3Qgb3RoZXJ3aXNlIGl0IHdpbGwgdGhyb3cgYSBnbG9iYWwgZXJyb3JcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRTZXRUaW1lb3V0LmNhbGwodGhpcywgZnVuLCAwKTtcbiAgICAgICAgfVxuICAgIH1cblxuXG59XG5mdW5jdGlvbiBydW5DbGVhclRpbWVvdXQobWFya2VyKSB7XG4gICAgaWYgKGNhY2hlZENsZWFyVGltZW91dCA9PT0gY2xlYXJUaW1lb3V0KSB7XG4gICAgICAgIC8vbm9ybWFsIGVudmlyb21lbnRzIGluIHNhbmUgc2l0dWF0aW9uc1xuICAgICAgICByZXR1cm4gY2xlYXJUaW1lb3V0KG1hcmtlcik7XG4gICAgfVxuICAgIC8vIGlmIGNsZWFyVGltZW91dCB3YXNuJ3QgYXZhaWxhYmxlIGJ1dCB3YXMgbGF0dGVyIGRlZmluZWRcbiAgICBpZiAoKGNhY2hlZENsZWFyVGltZW91dCA9PT0gZGVmYXVsdENsZWFyVGltZW91dCB8fCAhY2FjaGVkQ2xlYXJUaW1lb3V0KSAmJiBjbGVhclRpbWVvdXQpIHtcbiAgICAgICAgY2FjaGVkQ2xlYXJUaW1lb3V0ID0gY2xlYXJUaW1lb3V0O1xuICAgICAgICByZXR1cm4gY2xlYXJUaW1lb3V0KG1hcmtlcik7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICAgIC8vIHdoZW4gd2hlbiBzb21lYm9keSBoYXMgc2NyZXdlZCB3aXRoIHNldFRpbWVvdXQgYnV0IG5vIEkuRS4gbWFkZG5lc3NcbiAgICAgICAgcmV0dXJuIGNhY2hlZENsZWFyVGltZW91dChtYXJrZXIpO1xuICAgIH0gY2F0Y2ggKGUpe1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gV2hlbiB3ZSBhcmUgaW4gSS5FLiBidXQgdGhlIHNjcmlwdCBoYXMgYmVlbiBldmFsZWQgc28gSS5FLiBkb2Vzbid0ICB0cnVzdCB0aGUgZ2xvYmFsIG9iamVjdCB3aGVuIGNhbGxlZCBub3JtYWxseVxuICAgICAgICAgICAgcmV0dXJuIGNhY2hlZENsZWFyVGltZW91dC5jYWxsKG51bGwsIG1hcmtlcik7XG4gICAgICAgIH0gY2F0Y2ggKGUpe1xuICAgICAgICAgICAgLy8gc2FtZSBhcyBhYm92ZSBidXQgd2hlbiBpdCdzIGEgdmVyc2lvbiBvZiBJLkUuIHRoYXQgbXVzdCBoYXZlIHRoZSBnbG9iYWwgb2JqZWN0IGZvciAndGhpcycsIGhvcGZ1bGx5IG91ciBjb250ZXh0IGNvcnJlY3Qgb3RoZXJ3aXNlIGl0IHdpbGwgdGhyb3cgYSBnbG9iYWwgZXJyb3IuXG4gICAgICAgICAgICAvLyBTb21lIHZlcnNpb25zIG9mIEkuRS4gaGF2ZSBkaWZmZXJlbnQgcnVsZXMgZm9yIGNsZWFyVGltZW91dCB2cyBzZXRUaW1lb3V0XG4gICAgICAgICAgICByZXR1cm4gY2FjaGVkQ2xlYXJUaW1lb3V0LmNhbGwodGhpcywgbWFya2VyKTtcbiAgICAgICAgfVxuICAgIH1cblxuXG5cbn1cbnZhciBxdWV1ZSA9IFtdO1xudmFyIGRyYWluaW5nID0gZmFsc2U7XG52YXIgY3VycmVudFF1ZXVlO1xudmFyIHF1ZXVlSW5kZXggPSAtMTtcblxuZnVuY3Rpb24gY2xlYW5VcE5leHRUaWNrKCkge1xuICAgIGlmICghZHJhaW5pbmcgfHwgIWN1cnJlbnRRdWV1ZSkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGRyYWluaW5nID0gZmFsc2U7XG4gICAgaWYgKGN1cnJlbnRRdWV1ZS5sZW5ndGgpIHtcbiAgICAgICAgcXVldWUgPSBjdXJyZW50UXVldWUuY29uY2F0KHF1ZXVlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBxdWV1ZUluZGV4ID0gLTE7XG4gICAgfVxuICAgIGlmIChxdWV1ZS5sZW5ndGgpIHtcbiAgICAgICAgZHJhaW5RdWV1ZSgpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZHJhaW5RdWV1ZSgpIHtcbiAgICBpZiAoZHJhaW5pbmcpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB2YXIgdGltZW91dCA9IHJ1blRpbWVvdXQoY2xlYW5VcE5leHRUaWNrKTtcbiAgICBkcmFpbmluZyA9IHRydWU7XG5cbiAgICB2YXIgbGVuID0gcXVldWUubGVuZ3RoO1xuICAgIHdoaWxlKGxlbikge1xuICAgICAgICBjdXJyZW50UXVldWUgPSBxdWV1ZTtcbiAgICAgICAgcXVldWUgPSBbXTtcbiAgICAgICAgd2hpbGUgKCsrcXVldWVJbmRleCA8IGxlbikge1xuICAgICAgICAgICAgaWYgKGN1cnJlbnRRdWV1ZSkge1xuICAgICAgICAgICAgICAgIGN1cnJlbnRRdWV1ZVtxdWV1ZUluZGV4XS5ydW4oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBxdWV1ZUluZGV4ID0gLTE7XG4gICAgICAgIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB9XG4gICAgY3VycmVudFF1ZXVlID0gbnVsbDtcbiAgICBkcmFpbmluZyA9IGZhbHNlO1xuICAgIHJ1bkNsZWFyVGltZW91dCh0aW1lb3V0KTtcbn1cblxucHJvY2Vzcy5uZXh0VGljayA9IGZ1bmN0aW9uIChmdW4pIHtcbiAgICB2YXIgYXJncyA9IG5ldyBBcnJheShhcmd1bWVudHMubGVuZ3RoIC0gMSk7XG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPiAxKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBhcmdzW2kgLSAxXSA9IGFyZ3VtZW50c1tpXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBxdWV1ZS5wdXNoKG5ldyBJdGVtKGZ1biwgYXJncykpO1xuICAgIGlmIChxdWV1ZS5sZW5ndGggPT09IDEgJiYgIWRyYWluaW5nKSB7XG4gICAgICAgIHJ1blRpbWVvdXQoZHJhaW5RdWV1ZSk7XG4gICAgfVxufTtcblxuLy8gdjggbGlrZXMgcHJlZGljdGlibGUgb2JqZWN0c1xuZnVuY3Rpb24gSXRlbShmdW4sIGFycmF5KSB7XG4gICAgdGhpcy5mdW4gPSBmdW47XG4gICAgdGhpcy5hcnJheSA9IGFycmF5O1xufVxuSXRlbS5wcm90b3R5cGUucnVuID0gZnVuY3Rpb24gKCkge1xuICAgIHRoaXMuZnVuLmFwcGx5KG51bGwsIHRoaXMuYXJyYXkpO1xufTtcbnByb2Nlc3MudGl0bGUgPSAnYnJvd3Nlcic7XG5wcm9jZXNzLmJyb3dzZXIgPSB0cnVlO1xucHJvY2Vzcy5lbnYgPSB7fTtcbnByb2Nlc3MuYXJndiA9IFtdO1xucHJvY2Vzcy52ZXJzaW9uID0gJyc7IC8vIGVtcHR5IHN0cmluZyB0byBhdm9pZCByZWdleHAgaXNzdWVzXG5wcm9jZXNzLnZlcnNpb25zID0ge307XG5cbmZ1bmN0aW9uIG5vb3AoKSB7fVxuXG5wcm9jZXNzLm9uID0gbm9vcDtcbnByb2Nlc3MuYWRkTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5vbmNlID0gbm9vcDtcbnByb2Nlc3Mub2ZmID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVBbGxMaXN0ZW5lcnMgPSBub29wO1xucHJvY2Vzcy5lbWl0ID0gbm9vcDtcbnByb2Nlc3MucHJlcGVuZExpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3MucHJlcGVuZE9uY2VMaXN0ZW5lciA9IG5vb3A7XG5cbnByb2Nlc3MubGlzdGVuZXJzID0gZnVuY3Rpb24gKG5hbWUpIHsgcmV0dXJuIFtdIH1cblxucHJvY2Vzcy5iaW5kaW5nID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuYmluZGluZyBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xuXG5wcm9jZXNzLmN3ZCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICcvJyB9O1xucHJvY2Vzcy5jaGRpciA9IGZ1bmN0aW9uIChkaXIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuY2hkaXIgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcbnByb2Nlc3MudW1hc2sgPSBmdW5jdGlvbigpIHsgcmV0dXJuIDA7IH07XG4iLCJ2YXIgdG9wTGV2ZWwgPSB0eXBlb2YgZ2xvYmFsICE9PSAndW5kZWZpbmVkJyA/IGdsb2JhbCA6XG4gICAgdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB3aW5kb3cgOiB7fVxudmFyIG1pbkRvYyA9IHJlcXVpcmUoJ21pbi1kb2N1bWVudCcpO1xuXG52YXIgZG9jY3k7XG5cbmlmICh0eXBlb2YgZG9jdW1lbnQgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgZG9jY3kgPSBkb2N1bWVudDtcbn0gZWxzZSB7XG4gICAgZG9jY3kgPSB0b3BMZXZlbFsnX19HTE9CQUxfRE9DVU1FTlRfQ0FDSEVANCddO1xuXG4gICAgaWYgKCFkb2NjeSkge1xuICAgICAgICBkb2NjeSA9IHRvcExldmVsWydfX0dMT0JBTF9ET0NVTUVOVF9DQUNIRUA0J10gPSBtaW5Eb2M7XG4gICAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGRvY2N5O1xuIiwidmFyIHdpbjtcblxuaWYgKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICB3aW4gPSB3aW5kb3c7XG59IGVsc2UgaWYgKHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICB3aW4gPSBnbG9iYWw7XG59IGVsc2UgaWYgKHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiKXtcbiAgICB3aW4gPSBzZWxmO1xufSBlbHNlIHtcbiAgICB3aW4gPSB7fTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB3aW47XG4iLCIvLyAuZGlybmFtZSwgLmJhc2VuYW1lLCBhbmQgLmV4dG5hbWUgbWV0aG9kcyBhcmUgZXh0cmFjdGVkIGZyb20gTm9kZS5qcyB2OC4xMS4xLFxuLy8gYmFja3BvcnRlZCBhbmQgdHJhbnNwbGl0ZWQgd2l0aCBCYWJlbCwgd2l0aCBiYWNrd2FyZHMtY29tcGF0IGZpeGVzXG5cbi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG4vLyByZXNvbHZlcyAuIGFuZCAuLiBlbGVtZW50cyBpbiBhIHBhdGggYXJyYXkgd2l0aCBkaXJlY3RvcnkgbmFtZXMgdGhlcmVcbi8vIG11c3QgYmUgbm8gc2xhc2hlcywgZW1wdHkgZWxlbWVudHMsIG9yIGRldmljZSBuYW1lcyAoYzpcXCkgaW4gdGhlIGFycmF5XG4vLyAoc28gYWxzbyBubyBsZWFkaW5nIGFuZCB0cmFpbGluZyBzbGFzaGVzIC0gaXQgZG9lcyBub3QgZGlzdGluZ3Vpc2hcbi8vIHJlbGF0aXZlIGFuZCBhYnNvbHV0ZSBwYXRocylcbmZ1bmN0aW9uIG5vcm1hbGl6ZUFycmF5KHBhcnRzLCBhbGxvd0Fib3ZlUm9vdCkge1xuICAvLyBpZiB0aGUgcGF0aCB0cmllcyB0byBnbyBhYm92ZSB0aGUgcm9vdCwgYHVwYCBlbmRzIHVwID4gMFxuICB2YXIgdXAgPSAwO1xuICBmb3IgKHZhciBpID0gcGFydHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICB2YXIgbGFzdCA9IHBhcnRzW2ldO1xuICAgIGlmIChsYXN0ID09PSAnLicpIHtcbiAgICAgIHBhcnRzLnNwbGljZShpLCAxKTtcbiAgICB9IGVsc2UgaWYgKGxhc3QgPT09ICcuLicpIHtcbiAgICAgIHBhcnRzLnNwbGljZShpLCAxKTtcbiAgICAgIHVwKys7XG4gICAgfSBlbHNlIGlmICh1cCkge1xuICAgICAgcGFydHMuc3BsaWNlKGksIDEpO1xuICAgICAgdXAtLTtcbiAgICB9XG4gIH1cblxuICAvLyBpZiB0aGUgcGF0aCBpcyBhbGxvd2VkIHRvIGdvIGFib3ZlIHRoZSByb290LCByZXN0b3JlIGxlYWRpbmcgLi5zXG4gIGlmIChhbGxvd0Fib3ZlUm9vdCkge1xuICAgIGZvciAoOyB1cC0tOyB1cCkge1xuICAgICAgcGFydHMudW5zaGlmdCgnLi4nKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gcGFydHM7XG59XG5cbi8vIHBhdGgucmVzb2x2ZShbZnJvbSAuLi5dLCB0bylcbi8vIHBvc2l4IHZlcnNpb25cbmV4cG9ydHMucmVzb2x2ZSA9IGZ1bmN0aW9uKCkge1xuICB2YXIgcmVzb2x2ZWRQYXRoID0gJycsXG4gICAgICByZXNvbHZlZEFic29sdXRlID0gZmFsc2U7XG5cbiAgZm9yICh2YXIgaSA9IGFyZ3VtZW50cy5sZW5ndGggLSAxOyBpID49IC0xICYmICFyZXNvbHZlZEFic29sdXRlOyBpLS0pIHtcbiAgICB2YXIgcGF0aCA9IChpID49IDApID8gYXJndW1lbnRzW2ldIDogcHJvY2Vzcy5jd2QoKTtcblxuICAgIC8vIFNraXAgZW1wdHkgYW5kIGludmFsaWQgZW50cmllc1xuICAgIGlmICh0eXBlb2YgcGF0aCAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0FyZ3VtZW50cyB0byBwYXRoLnJlc29sdmUgbXVzdCBiZSBzdHJpbmdzJyk7XG4gICAgfSBlbHNlIGlmICghcGF0aCkge1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgcmVzb2x2ZWRQYXRoID0gcGF0aCArICcvJyArIHJlc29sdmVkUGF0aDtcbiAgICByZXNvbHZlZEFic29sdXRlID0gcGF0aC5jaGFyQXQoMCkgPT09ICcvJztcbiAgfVxuXG4gIC8vIEF0IHRoaXMgcG9pbnQgdGhlIHBhdGggc2hvdWxkIGJlIHJlc29sdmVkIHRvIGEgZnVsbCBhYnNvbHV0ZSBwYXRoLCBidXRcbiAgLy8gaGFuZGxlIHJlbGF0aXZlIHBhdGhzIHRvIGJlIHNhZmUgKG1pZ2h0IGhhcHBlbiB3aGVuIHByb2Nlc3MuY3dkKCkgZmFpbHMpXG5cbiAgLy8gTm9ybWFsaXplIHRoZSBwYXRoXG4gIHJlc29sdmVkUGF0aCA9IG5vcm1hbGl6ZUFycmF5KGZpbHRlcihyZXNvbHZlZFBhdGguc3BsaXQoJy8nKSwgZnVuY3Rpb24ocCkge1xuICAgIHJldHVybiAhIXA7XG4gIH0pLCAhcmVzb2x2ZWRBYnNvbHV0ZSkuam9pbignLycpO1xuXG4gIHJldHVybiAoKHJlc29sdmVkQWJzb2x1dGUgPyAnLycgOiAnJykgKyByZXNvbHZlZFBhdGgpIHx8ICcuJztcbn07XG5cbi8vIHBhdGgubm9ybWFsaXplKHBhdGgpXG4vLyBwb3NpeCB2ZXJzaW9uXG5leHBvcnRzLm5vcm1hbGl6ZSA9IGZ1bmN0aW9uKHBhdGgpIHtcbiAgdmFyIGlzQWJzb2x1dGUgPSBleHBvcnRzLmlzQWJzb2x1dGUocGF0aCksXG4gICAgICB0cmFpbGluZ1NsYXNoID0gc3Vic3RyKHBhdGgsIC0xKSA9PT0gJy8nO1xuXG4gIC8vIE5vcm1hbGl6ZSB0aGUgcGF0aFxuICBwYXRoID0gbm9ybWFsaXplQXJyYXkoZmlsdGVyKHBhdGguc3BsaXQoJy8nKSwgZnVuY3Rpb24ocCkge1xuICAgIHJldHVybiAhIXA7XG4gIH0pLCAhaXNBYnNvbHV0ZSkuam9pbignLycpO1xuXG4gIGlmICghcGF0aCAmJiAhaXNBYnNvbHV0ZSkge1xuICAgIHBhdGggPSAnLic7XG4gIH1cbiAgaWYgKHBhdGggJiYgdHJhaWxpbmdTbGFzaCkge1xuICAgIHBhdGggKz0gJy8nO1xuICB9XG5cbiAgcmV0dXJuIChpc0Fic29sdXRlID8gJy8nIDogJycpICsgcGF0aDtcbn07XG5cbi8vIHBvc2l4IHZlcnNpb25cbmV4cG9ydHMuaXNBYnNvbHV0ZSA9IGZ1bmN0aW9uKHBhdGgpIHtcbiAgcmV0dXJuIHBhdGguY2hhckF0KDApID09PSAnLyc7XG59O1xuXG4vLyBwb3NpeCB2ZXJzaW9uXG5leHBvcnRzLmpvaW4gPSBmdW5jdGlvbigpIHtcbiAgdmFyIHBhdGhzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAwKTtcbiAgcmV0dXJuIGV4cG9ydHMubm9ybWFsaXplKGZpbHRlcihwYXRocywgZnVuY3Rpb24ocCwgaW5kZXgpIHtcbiAgICBpZiAodHlwZW9mIHAgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdBcmd1bWVudHMgdG8gcGF0aC5qb2luIG11c3QgYmUgc3RyaW5ncycpO1xuICAgIH1cbiAgICByZXR1cm4gcDtcbiAgfSkuam9pbignLycpKTtcbn07XG5cblxuLy8gcGF0aC5yZWxhdGl2ZShmcm9tLCB0bylcbi8vIHBvc2l4IHZlcnNpb25cbmV4cG9ydHMucmVsYXRpdmUgPSBmdW5jdGlvbihmcm9tLCB0bykge1xuICBmcm9tID0gZXhwb3J0cy5yZXNvbHZlKGZyb20pLnN1YnN0cigxKTtcbiAgdG8gPSBleHBvcnRzLnJlc29sdmUodG8pLnN1YnN0cigxKTtcblxuICBmdW5jdGlvbiB0cmltKGFycikge1xuICAgIHZhciBzdGFydCA9IDA7XG4gICAgZm9yICg7IHN0YXJ0IDwgYXJyLmxlbmd0aDsgc3RhcnQrKykge1xuICAgICAgaWYgKGFycltzdGFydF0gIT09ICcnKSBicmVhaztcbiAgICB9XG5cbiAgICB2YXIgZW5kID0gYXJyLmxlbmd0aCAtIDE7XG4gICAgZm9yICg7IGVuZCA+PSAwOyBlbmQtLSkge1xuICAgICAgaWYgKGFycltlbmRdICE9PSAnJykgYnJlYWs7XG4gICAgfVxuXG4gICAgaWYgKHN0YXJ0ID4gZW5kKSByZXR1cm4gW107XG4gICAgcmV0dXJuIGFyci5zbGljZShzdGFydCwgZW5kIC0gc3RhcnQgKyAxKTtcbiAgfVxuXG4gIHZhciBmcm9tUGFydHMgPSB0cmltKGZyb20uc3BsaXQoJy8nKSk7XG4gIHZhciB0b1BhcnRzID0gdHJpbSh0by5zcGxpdCgnLycpKTtcblxuICB2YXIgbGVuZ3RoID0gTWF0aC5taW4oZnJvbVBhcnRzLmxlbmd0aCwgdG9QYXJ0cy5sZW5ndGgpO1xuICB2YXIgc2FtZVBhcnRzTGVuZ3RoID0gbGVuZ3RoO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKGZyb21QYXJ0c1tpXSAhPT0gdG9QYXJ0c1tpXSkge1xuICAgICAgc2FtZVBhcnRzTGVuZ3RoID0gaTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIHZhciBvdXRwdXRQYXJ0cyA9IFtdO1xuICBmb3IgKHZhciBpID0gc2FtZVBhcnRzTGVuZ3RoOyBpIDwgZnJvbVBhcnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgb3V0cHV0UGFydHMucHVzaCgnLi4nKTtcbiAgfVxuXG4gIG91dHB1dFBhcnRzID0gb3V0cHV0UGFydHMuY29uY2F0KHRvUGFydHMuc2xpY2Uoc2FtZVBhcnRzTGVuZ3RoKSk7XG5cbiAgcmV0dXJuIG91dHB1dFBhcnRzLmpvaW4oJy8nKTtcbn07XG5cbmV4cG9ydHMuc2VwID0gJy8nO1xuZXhwb3J0cy5kZWxpbWl0ZXIgPSAnOic7XG5cbmV4cG9ydHMuZGlybmFtZSA9IGZ1bmN0aW9uIChwYXRoKSB7XG4gIGlmICh0eXBlb2YgcGF0aCAhPT0gJ3N0cmluZycpIHBhdGggPSBwYXRoICsgJyc7XG4gIGlmIChwYXRoLmxlbmd0aCA9PT0gMCkgcmV0dXJuICcuJztcbiAgdmFyIGNvZGUgPSBwYXRoLmNoYXJDb2RlQXQoMCk7XG4gIHZhciBoYXNSb290ID0gY29kZSA9PT0gNDcgLyovKi87XG4gIHZhciBlbmQgPSAtMTtcbiAgdmFyIG1hdGNoZWRTbGFzaCA9IHRydWU7XG4gIGZvciAodmFyIGkgPSBwYXRoLmxlbmd0aCAtIDE7IGkgPj0gMTsgLS1pKSB7XG4gICAgY29kZSA9IHBhdGguY2hhckNvZGVBdChpKTtcbiAgICBpZiAoY29kZSA9PT0gNDcgLyovKi8pIHtcbiAgICAgICAgaWYgKCFtYXRjaGVkU2xhc2gpIHtcbiAgICAgICAgICBlbmQgPSBpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgLy8gV2Ugc2F3IHRoZSBmaXJzdCBub24tcGF0aCBzZXBhcmF0b3JcbiAgICAgIG1hdGNoZWRTbGFzaCA9IGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIGlmIChlbmQgPT09IC0xKSByZXR1cm4gaGFzUm9vdCA/ICcvJyA6ICcuJztcbiAgaWYgKGhhc1Jvb3QgJiYgZW5kID09PSAxKSB7XG4gICAgLy8gcmV0dXJuICcvLyc7XG4gICAgLy8gQmFja3dhcmRzLWNvbXBhdCBmaXg6XG4gICAgcmV0dXJuICcvJztcbiAgfVxuICByZXR1cm4gcGF0aC5zbGljZSgwLCBlbmQpO1xufTtcblxuZnVuY3Rpb24gYmFzZW5hbWUocGF0aCkge1xuICBpZiAodHlwZW9mIHBhdGggIT09ICdzdHJpbmcnKSBwYXRoID0gcGF0aCArICcnO1xuXG4gIHZhciBzdGFydCA9IDA7XG4gIHZhciBlbmQgPSAtMTtcbiAgdmFyIG1hdGNoZWRTbGFzaCA9IHRydWU7XG4gIHZhciBpO1xuXG4gIGZvciAoaSA9IHBhdGgubGVuZ3RoIC0gMTsgaSA+PSAwOyAtLWkpIHtcbiAgICBpZiAocGF0aC5jaGFyQ29kZUF0KGkpID09PSA0NyAvKi8qLykge1xuICAgICAgICAvLyBJZiB3ZSByZWFjaGVkIGEgcGF0aCBzZXBhcmF0b3IgdGhhdCB3YXMgbm90IHBhcnQgb2YgYSBzZXQgb2YgcGF0aFxuICAgICAgICAvLyBzZXBhcmF0b3JzIGF0IHRoZSBlbmQgb2YgdGhlIHN0cmluZywgc3RvcCBub3dcbiAgICAgICAgaWYgKCFtYXRjaGVkU2xhc2gpIHtcbiAgICAgICAgICBzdGFydCA9IGkgKyAxO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGVuZCA9PT0gLTEpIHtcbiAgICAgIC8vIFdlIHNhdyB0aGUgZmlyc3Qgbm9uLXBhdGggc2VwYXJhdG9yLCBtYXJrIHRoaXMgYXMgdGhlIGVuZCBvZiBvdXJcbiAgICAgIC8vIHBhdGggY29tcG9uZW50XG4gICAgICBtYXRjaGVkU2xhc2ggPSBmYWxzZTtcbiAgICAgIGVuZCA9IGkgKyAxO1xuICAgIH1cbiAgfVxuXG4gIGlmIChlbmQgPT09IC0xKSByZXR1cm4gJyc7XG4gIHJldHVybiBwYXRoLnNsaWNlKHN0YXJ0LCBlbmQpO1xufVxuXG4vLyBVc2VzIGEgbWl4ZWQgYXBwcm9hY2ggZm9yIGJhY2t3YXJkcy1jb21wYXRpYmlsaXR5LCBhcyBleHQgYmVoYXZpb3IgY2hhbmdlZFxuLy8gaW4gbmV3IE5vZGUuanMgdmVyc2lvbnMsIHNvIG9ubHkgYmFzZW5hbWUoKSBhYm92ZSBpcyBiYWNrcG9ydGVkIGhlcmVcbmV4cG9ydHMuYmFzZW5hbWUgPSBmdW5jdGlvbiAocGF0aCwgZXh0KSB7XG4gIHZhciBmID0gYmFzZW5hbWUocGF0aCk7XG4gIGlmIChleHQgJiYgZi5zdWJzdHIoLTEgKiBleHQubGVuZ3RoKSA9PT0gZXh0KSB7XG4gICAgZiA9IGYuc3Vic3RyKDAsIGYubGVuZ3RoIC0gZXh0Lmxlbmd0aCk7XG4gIH1cbiAgcmV0dXJuIGY7XG59O1xuXG5leHBvcnRzLmV4dG5hbWUgPSBmdW5jdGlvbiAocGF0aCkge1xuICBpZiAodHlwZW9mIHBhdGggIT09ICdzdHJpbmcnKSBwYXRoID0gcGF0aCArICcnO1xuICB2YXIgc3RhcnREb3QgPSAtMTtcbiAgdmFyIHN0YXJ0UGFydCA9IDA7XG4gIHZhciBlbmQgPSAtMTtcbiAgdmFyIG1hdGNoZWRTbGFzaCA9IHRydWU7XG4gIC8vIFRyYWNrIHRoZSBzdGF0ZSBvZiBjaGFyYWN0ZXJzIChpZiBhbnkpIHdlIHNlZSBiZWZvcmUgb3VyIGZpcnN0IGRvdCBhbmRcbiAgLy8gYWZ0ZXIgYW55IHBhdGggc2VwYXJhdG9yIHdlIGZpbmRcbiAgdmFyIHByZURvdFN0YXRlID0gMDtcbiAgZm9yICh2YXIgaSA9IHBhdGgubGVuZ3RoIC0gMTsgaSA+PSAwOyAtLWkpIHtcbiAgICB2YXIgY29kZSA9IHBhdGguY2hhckNvZGVBdChpKTtcbiAgICBpZiAoY29kZSA9PT0gNDcgLyovKi8pIHtcbiAgICAgICAgLy8gSWYgd2UgcmVhY2hlZCBhIHBhdGggc2VwYXJhdG9yIHRoYXQgd2FzIG5vdCBwYXJ0IG9mIGEgc2V0IG9mIHBhdGhcbiAgICAgICAgLy8gc2VwYXJhdG9ycyBhdCB0aGUgZW5kIG9mIHRoZSBzdHJpbmcsIHN0b3Agbm93XG4gICAgICAgIGlmICghbWF0Y2hlZFNsYXNoKSB7XG4gICAgICAgICAgc3RhcnRQYXJ0ID0gaSArIDE7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgaWYgKGVuZCA9PT0gLTEpIHtcbiAgICAgIC8vIFdlIHNhdyB0aGUgZmlyc3Qgbm9uLXBhdGggc2VwYXJhdG9yLCBtYXJrIHRoaXMgYXMgdGhlIGVuZCBvZiBvdXJcbiAgICAgIC8vIGV4dGVuc2lvblxuICAgICAgbWF0Y2hlZFNsYXNoID0gZmFsc2U7XG4gICAgICBlbmQgPSBpICsgMTtcbiAgICB9XG4gICAgaWYgKGNvZGUgPT09IDQ2IC8qLiovKSB7XG4gICAgICAgIC8vIElmIHRoaXMgaXMgb3VyIGZpcnN0IGRvdCwgbWFyayBpdCBhcyB0aGUgc3RhcnQgb2Ygb3VyIGV4dGVuc2lvblxuICAgICAgICBpZiAoc3RhcnREb3QgPT09IC0xKVxuICAgICAgICAgIHN0YXJ0RG90ID0gaTtcbiAgICAgICAgZWxzZSBpZiAocHJlRG90U3RhdGUgIT09IDEpXG4gICAgICAgICAgcHJlRG90U3RhdGUgPSAxO1xuICAgIH0gZWxzZSBpZiAoc3RhcnREb3QgIT09IC0xKSB7XG4gICAgICAvLyBXZSBzYXcgYSBub24tZG90IGFuZCBub24tcGF0aCBzZXBhcmF0b3IgYmVmb3JlIG91ciBkb3QsIHNvIHdlIHNob3VsZFxuICAgICAgLy8gaGF2ZSBhIGdvb2QgY2hhbmNlIGF0IGhhdmluZyBhIG5vbi1lbXB0eSBleHRlbnNpb25cbiAgICAgIHByZURvdFN0YXRlID0gLTE7XG4gICAgfVxuICB9XG5cbiAgaWYgKHN0YXJ0RG90ID09PSAtMSB8fCBlbmQgPT09IC0xIHx8XG4gICAgICAvLyBXZSBzYXcgYSBub24tZG90IGNoYXJhY3RlciBpbW1lZGlhdGVseSBiZWZvcmUgdGhlIGRvdFxuICAgICAgcHJlRG90U3RhdGUgPT09IDAgfHxcbiAgICAgIC8vIFRoZSAocmlnaHQtbW9zdCkgdHJpbW1lZCBwYXRoIGNvbXBvbmVudCBpcyBleGFjdGx5ICcuLidcbiAgICAgIHByZURvdFN0YXRlID09PSAxICYmIHN0YXJ0RG90ID09PSBlbmQgLSAxICYmIHN0YXJ0RG90ID09PSBzdGFydFBhcnQgKyAxKSB7XG4gICAgcmV0dXJuICcnO1xuICB9XG4gIHJldHVybiBwYXRoLnNsaWNlKHN0YXJ0RG90LCBlbmQpO1xufTtcblxuZnVuY3Rpb24gZmlsdGVyICh4cywgZikge1xuICAgIGlmICh4cy5maWx0ZXIpIHJldHVybiB4cy5maWx0ZXIoZik7XG4gICAgdmFyIHJlcyA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgeHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKGYoeHNbaV0sIGksIHhzKSkgcmVzLnB1c2goeHNbaV0pO1xuICAgIH1cbiAgICByZXR1cm4gcmVzO1xufVxuXG4vLyBTdHJpbmcucHJvdG90eXBlLnN1YnN0ciAtIG5lZ2F0aXZlIGluZGV4IGRvbid0IHdvcmsgaW4gSUU4XG52YXIgc3Vic3RyID0gJ2FiJy5zdWJzdHIoLTEpID09PSAnYidcbiAgICA/IGZ1bmN0aW9uIChzdHIsIHN0YXJ0LCBsZW4pIHsgcmV0dXJuIHN0ci5zdWJzdHIoc3RhcnQsIGxlbikgfVxuICAgIDogZnVuY3Rpb24gKHN0ciwgc3RhcnQsIGxlbikge1xuICAgICAgICBpZiAoc3RhcnQgPCAwKSBzdGFydCA9IHN0ci5sZW5ndGggKyBzdGFydDtcbiAgICAgICAgcmV0dXJuIHN0ci5zdWJzdHIoc3RhcnQsIGxlbik7XG4gICAgfVxuO1xuIl19
