# set

## 基础操作

### 方法

- add 添加元素 (返回集合本身，可连续调用)

```js
const set = new Set();
set.add(1).add(2).add(3);
console.log(set);
```

- delete 删除元素 (返回布尔值)

```js
const set = new Set([1, 2, 3]);
set.delete(2);
console.log(set);
```

- has 判断元素是否存在 (返回布尔值)
- clear 清空集合 (无返回值)

### 属性

- size 返回集合中元素的个数 (返回一个数字)
  > set 没有 length属性，也不能用索引访问

## 遍历与迭代

- for...of 遍历集合中的所有元素 (返回一个迭代器)

```js
const set = new Set([1, 2, 3]);
for (const num of set) {
  console.log(num);
}
```

- forEach 遍历集合中的所有元素 (返回一个迭代器)

```js
const set = new Set([1, 2, 3]);
set.forEach((value) => {
  console.log(value);
});
```

- entries 返回一个迭代器，包含所有键值对
- keys 返回一个迭代器，包含所有键
- values 返回一个迭代器，包含所有值

##

## set vs 数组

| 特性     | Array (数组)                                  | Set (集合)                            |
| -------- | --------------------------------------------- | ------------------------------------- |
| 重复元素 | 允许（可以有多个相同的值）                    | 绝不允许多个（天然去重）              |
| 访问方式 | 通过索引访问（如 arr[0]）                     | 无索引，只能通过遍历或 has() 检查     |
| 查找效率 | 慢：$O(n)$，需从头到尾扫一遍 (arr.includes()) | 极快：$O(1)$，瞬间定位 (set.has())    |
| 删除效率 | 慢：$O(n)$，删除后,后面的元素要整体前移       | 极快：$O(1)$，直接移除 (set.delete()) |
| 长度属性 | .length                                       | .size                                 |

# map

## 基本操作

### 方法

- set 添加元素 (返回 map本身，可连续调用)

```js
const map = new Map();
map.set(1, 2).set(2, 3).set(3, 4);
console.log(map);
```

- get 获取元素 (返回元素)

```js
const map = new Map([[1, 2], [2, 3], [3, 4]]);
map.get(2);
console.log(map);
```

- delete 删除元素 (返回布尔值)

```js
const map = new Map([[1, 2], [2, 3], [3, 4]]);
map.delete(2);
console.log(map);
```

- has 判断元素是否存在 (返回布尔值)
- clear 清空 map (无返回值)

### 属性

- size 返回 map中元素的个数 (返回一个数字)
  > map 没有 length属性，也不能用索引访问

## 遍历与迭代

- for...of 遍历集合中的所有元素 (返回一个迭代器)

```js
const set = new Set([1, 2, 3]);
for (const num of set) {
  console.log(num);
}
```

- forEach 遍历集合中的所有元素 (返回一个迭代器)

```js
const set = new Set([1, 2, 3]);
set.forEach((value) => {
  console.log(value);
});
```

- entries 返回一个迭代器，包含所有键值对
- keys 返回一个迭代器，包含所有键
- values 返回一个迭代器，包含所有值

## map vs 对象

### 键的类型不同

- Object： 键只能是 字符串 或 Symbol。

- Map： 键可以是 任何类型。 不仅可以是数字、布尔值，还可以是数组、对象、甚至函数。

### 原型链与安全性

- Object： 创建一个普通对象时，它默认会继承 `Object.prototype`。所以天生自带一些键（比如 `toString`、`hasOwnProperty`）。因此接收用户输入作为键名时，可能会不小心覆盖这些自带方法，导致安全漏洞（原型链污染）。

- Map： 默认情况下不包含任何键，非常干净，只包含你显式放进去的内容。

### 获取长度的方式

- Object：`Object.keys(obj).length` 获取长度，时间复杂度是 $O(n)$。

- Map： 原生自带 `.size` 属性，获取长度的时间复杂度是 $O(1)$。

### 遍历的方式

- Object： 不可迭代，不能直接用 `for...of` 循环。你得转换成 `Object.keys()` 或 `Object.entries()` 才能遍历。

```js
const obj = {
  a: 1,
  b: 2,
  c: 3,
};
for (const key of Object.keys(obj)) {
  console.log(key);
}

for (const [key, value] of Object.entries(obj)) {
  console.log(key, value);
}
```

- Map： 天生就是“可迭代的”，并且严格保证插入顺序。你可以直接用 for...of 或自带的 `.forEach()` 愉快地遍历：

```js
const map = new Map([
  ["a", 1],
  ["b", 2],
  ["c", 3],
]);
for (const [key, value] of map) {
  console.log(key, value);
}

map.forEach((value, key) => {
  console.log(value, key);
});
```
