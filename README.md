# js-psychokinesis
[![Build Status](https://travis-ci.org/psychokinesis-dev/js-psychokinesis.svg?branch=master)](https://travis-ci.org/psychokinesis-dev/js-psychokinesis)
[![Coverage Status](https://coveralls.io/repos/psychokinesis-dev/js-psychokinesis/badge.svg)](https://coveralls.io/r/psychokinesis-dev/js-psychokinesis)
[![npm version](https://badge.fury.io/js/psychokinesis.svg)](http://badge.fury.io/js/psychokinesis)
![Downloads](https://img.shields.io/npm/dm/psychokinesis.svg?style=flat)

去中心化的 HTTP 服务器，基于 DHT 、 HTTP/2 。

## 特性
- P2P 节点间功能相同，地位相等
- 支持 NAT 内网节点也可建立对外的 HTTP 服务

## 优势
- 完全分散的数据。传统 C/S 架构需要将数据放置于 Server 端存储， 数据的控制权最终在于少数的 Server 节点，而 Psychokinesis 网络中数据完全存储于本地，不存在特权节点。
- 极易扩展。Psychokinesis 网络中所有节点均有完全的功能，任一节点都可作为网络的入口。

## 快速开始
1. `npm install psychokinesis -g`
2. 启动一个独立的节点：`psychokinesis test.psy -d 8181 -p 18181 -l 127.0.0.1`

更多用法可查看帮助：`psychokinesis --help`

## 安装
1. Node.js：版本 >= v5.3.0
2. `npm install psychokinesis`

## 示例
```js
'use strict';

var psychokinesis = require('psychokinesis');

let server = psychokinesis.createServer({
    domain: 'publicnode.com'
}, (req, resp) => {
    resp.end('hello world');
});

server.on('ready', () => {
    server.listen('127.0.0.1', 8181, () => {
        console.log('Node up!');
    });
});
```
完成后即可使用浏览器访问 http://127.0.0.1:8181/publicnode.com/ 。

更多示例可查看 examples 目录。

## Docker
### 打包
```bash
$ docker build -t covertness/psychokinesis .
```