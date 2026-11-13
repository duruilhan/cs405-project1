import {identity, multiply} from "../math/mat4.js";
export class SceneNode {
  constructor(name, localMatrix = identity()) {
    this.name = name;
    this.localMatrix = localMatrix;
    this.worldMatrix = identity();
    this.parent = null;
    this.children = [];
  }
  addChild(child) {
    if (child === this) {
      throw new Error("A node cannot be its own child.");
    }
    let ancestor = this;
    while (ancestor !== null) {
      if (ancestor === child) {
        throw new Error("Scene graph cannot contain cycles.");
      }
      ancestor = ancestor.parent;
    }
    if (child.parent !== null) {
      child.parent.removeChild(child);
    }
    child.parent = this;
    this.children.push(child);
    return child;
  }
  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index !== -1) {
      this.children.splice(index, 1);
      child.parent = null;
    }
  }
  setLocalMatrix(matrix) {
    this.localMatrix = matrix;
  }
  updateWorldMatrix(parentWorld = identity()) {
    this.worldMatrix = multiply(parentWorld, this.localMatrix);
    for (const child of this.children) {
      child.updateWorldMatrix(this.worldMatrix);
    }
  }
  traverse(callback) {
    callback(this);
    for (const child of this.children) {
      child.traverse(callback);
    }
  }
}