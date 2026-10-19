// 4×4 transform math in Blender's conventions. Matrices are column-major Float64Array(16), the layout of
// Blender's float[4][4] (m[column][row]) flattened, which is also what WebGL libraries take.

export type Matrix4 = Float64Array;
type Vector3 = readonly [number, number, number];
type Matrix3 = readonly [Vector3, Vector3, Vector3]; // columns

/** Object.rotmode values (DNA_action_types.h). Positive values are Euler orders. */
export const ROTATION_MODE_QUATERNION = 0;
export const ROTATION_MODE_AXIS_ANGLE = -1;
const EULER_ORDERS: Record<number, readonly [number, number, number]> = {
  1: [0, 1, 2], // XYZ
  2: [0, 2, 1], // XZY
  3: [1, 0, 2], // YXZ
  4: [1, 2, 0], // YZX
  5: [2, 0, 1], // ZXY
  6: [2, 1, 0], // ZYX
};

export const createIdentityMatrix = (): Matrix4 => Float64Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);

/** Column-major product `left · right`. */
export function multiplyMatrices(left: Matrix4, right: Matrix4): Matrix4 {
  const product = new Float64Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let index = 0; index < 4; index += 1) sum += left[index * 4 + row]! * right[column * 4 + index]!;
      product[column * 4 + row] = sum;
    }
  }
  return product;
}

/** A float[4][4] member as read from the file (nested columns) to a Matrix4. */
export const matrixFromNestedColumns = (columns: number[][]): Matrix4 => Float64Array.from(columns.flat());

const multiplyMatrices3 = (left: Matrix3, right: Matrix3): Matrix3 =>
  right.map((column) => [0, 1, 2].map((row) => left[0][row]! * column[0] + left[1][row]! * column[1] + left[2][row]! * column[2]) as unknown as Vector3) as unknown as Matrix3;

function axisRotationMatrix3(axis: number, angle: number): Matrix3 {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  if (axis === 0) return [[1, 0, 0], [0, cosine, sine], [0, -sine, cosine]];
  if (axis === 1) return [[cosine, 0, -sine], [0, 1, 0], [sine, 0, cosine]];
  return [[cosine, sine, 0], [-sine, cosine, 0], [0, 0, 1]];
}

/** Blender's eulO_to_mat3: the first axis of the order is applied first, so XYZ is Rz · Ry · Rx. */
export function eulerToMatrix3(euler: Vector3, rotationMode: number): Matrix3 {
  const [first, second, third] = EULER_ORDERS[rotationMode] ?? EULER_ORDERS[1]!;
  return multiplyMatrices3(axisRotationMatrix3(third, euler[third]!), multiplyMatrices3(axisRotationMatrix3(second, euler[second]!), axisRotationMatrix3(first, euler[first]!)));
}

/** Quaternion (w, x, y, z), normalized first like Blender does. A zero quaternion gives the identity. */
export function quaternionToMatrix3([w, x, y, z]: readonly [number, number, number, number]): Matrix3 {
  const length = Math.hypot(w, x, y, z);
  if (length === 0) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const [qw, qx, qy, qz] = [w / length, x / length, y / length, z / length];
  return [
    [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy + qw * qz), 2 * (qx * qz - qw * qy)],
    [2 * (qx * qy - qw * qz), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz + qw * qx)],
    [2 * (qx * qz + qw * qy), 2 * (qy * qz - qw * qx), 1 - 2 * (qx * qx + qy * qy)],
  ];
}

export function axisAngleToMatrix3(axis: Vector3, angle: number): Matrix3 {
  const length = Math.hypot(...axis);
  if (length === 0) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const half = angle / 2;
  const sine = Math.sin(half) / length;
  return quaternionToMatrix3([Math.cos(half), axis[0] * sine, axis[1] * sine, axis[2] * sine]);
}

/** The transform members of an Object, under the names the file stores. */
export interface ObjectTransformMembers {
  loc: Vector3;
  dloc: Vector3;
  size: Vector3;
  dscale: Vector3;
  rotmode: number;
  rot: Vector3;
  drot: Vector3;
  quat: readonly [number, number, number, number];
  dquat: readonly [number, number, number, number];
  rotAxis: Vector3;
  rotAngle: number;
  drotAxis: Vector3;
  drotAngle: number;
}

/** BKE_object_to_mat4: translation (loc + dloc) · rotation (drot · rot) · scale (size · dscale). */
export function composeObjectLocalMatrix(transform: ObjectTransformMembers): Matrix4 {
  const { rotmode } = transform;
  const [rotation, deltaRotation] =
    rotmode > 0
      ? [eulerToMatrix3(transform.rot, rotmode), eulerToMatrix3(transform.drot, rotmode)]
      : rotmode === ROTATION_MODE_AXIS_ANGLE
        ? [axisAngleToMatrix3(transform.rotAxis, transform.rotAngle), axisAngleToMatrix3(transform.drotAxis, transform.drotAngle)]
        : [quaternionToMatrix3(transform.quat), quaternionToMatrix3(transform.dquat)];
  const combinedRotation = multiplyMatrices3(deltaRotation, rotation);
  const matrix = createIdentityMatrix();
  for (let column = 0; column < 3; column += 1) {
    const scale = transform.size[column]! * transform.dscale[column]!;
    for (let row = 0; row < 3; row += 1) matrix[column * 4 + row] = combinedRotation[column]![row]! * scale;
  }
  for (let row = 0; row < 3; row += 1) matrix[12 + row] = transform.loc[row]! + transform.dloc[row]!;
  return matrix;
}
