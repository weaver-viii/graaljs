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

'use strict';
const common = require('../common');
const assert = require('assert');
const dns = require('dns');
const net = require('net');

// Test wrong type of ports
{
  const portTypeError = common.expectsError({
    code: 'ERR_INVALID_ARG_TYPE',
    type: TypeError
  }, 96);

  syncFailToConnect(true, portTypeError);
  syncFailToConnect(false, portTypeError);
  syncFailToConnect([], portTypeError, true);
  syncFailToConnect({}, portTypeError, true);
  syncFailToConnect(null, portTypeError);
}

// Test out of range ports
{
  const portRangeError = common.expectsError({
    code: 'ERR_SOCKET_BAD_PORT',
    type: RangeError
  }, 168);

  syncFailToConnect('', portRangeError);
  syncFailToConnect(' ', portRangeError);
  syncFailToConnect('0x', portRangeError, true);
  syncFailToConnect('-0x1', portRangeError, true);
  syncFailToConnect(NaN, portRangeError);
  syncFailToConnect(Infinity, portRangeError);
  syncFailToConnect(-1, portRangeError);
  syncFailToConnect(65536, portRangeError);
}

// Test invalid hints
{
  // connect({hint}, cb) and connect({hint})
  const hints = (dns.ADDRCONFIG | dns.V4MAPPED) + 42;
  const hintOptBlocks = doConnect([{ hints }],
                                  () => common.mustNotCall());
  for (const block of hintOptBlocks) {
    common.expectsError(block, {
      code: 'ERR_INVALID_OPT_VALUE',
      type: TypeError,
      message: /The value "\d+" is invalid for option "hints"/
    });
  }
}

// Test valid combinations of connect(port) and connect(port, host)
{
  const expectedConnections = 72;
  let serverConnected = 0;

  const server = net.createServer(common.mustCall(function(socket) {
    socket.end('ok');
    if (++serverConnected === expectedConnections) {
      server.close();
    }
  }, expectedConnections));

  server.listen(0, 'localhost', common.mustCall(function() {
    const port = this.address().port;

    // Total connections = 3 * 4(canConnect) * 6(doConnect) = 72
    canConnect(port);
    canConnect(String(port));
    canConnect(`0x${port.toString(16)}`);
  }));

  // Try connecting to random ports, but do so once the server is closed
  server.on('close', function() {
    asyncFailToConnect(0);
    asyncFailToConnect(/* undefined */);
  });
}

function doConnect(args, getCb) {
  return [
    function createConnectionWithCb() {
      return net.createConnection.apply(net, args.concat(getCb()))
        .resume();
    },
    function createConnectionWithoutCb() {
      return net.createConnection.apply(net, args)
        .on('connect', getCb())
        .resume();
    },
    function connectWithCb() {
      return net.connect.apply(net, args.concat(getCb()))
        .resume();
    },
    function connectWithoutCb() {
      return net.connect.apply(net, args)
        .on('connect', getCb())
        .resume();
    },
    function socketConnectWithCb() {
      const socket = new net.Socket();
      return socket.connect.apply(socket, args.concat(getCb()))
        .resume();
    },
    function socketConnectWithoutCb() {
      const socket = new net.Socket();
      return socket.connect.apply(socket, args)
        .on('connect', getCb())
        .resume();
    }
  ];
}

function syncFailToConnect(port, assertErr, optOnly) {
  if (!optOnly) {
    // connect(port, cb) and connect(port)
    const portArgBlocks = doConnect([port], () => common.mustNotCall());
    for (const block of portArgBlocks) {
      assert.throws(block,
                    assertErr,
                    `${block.name}(${port})`);
    }

    // connect(port, host, cb) and connect(port, host)
    const portHostArgBlocks = doConnect([port, 'localhost'],
                                        () => common.mustNotCall());
    for (const block of portHostArgBlocks) {
      assert.throws(block,
                    assertErr,
                    `${block.name}(${port}, 'localhost')`);
    }
  }
  // connect({port}, cb) and connect({port})
  const portOptBlocks = doConnect([{ port }],
                                  () => common.mustNotCall());
  for (const block of portOptBlocks) {
    assert.throws(block,
                  assertErr,
                  `${block.name}({port: ${port}})`);
  }

  // connect({port, host}, cb) and connect({port, host})
  const portHostOptBlocks = doConnect([{ port: port, host: 'localhost' }],
                                      () => common.mustNotCall());
  for (const block of portHostOptBlocks) {
    assert.throws(block,
                  assertErr,
                  `${block.name}({port: ${port}, host: 'localhost'})`);
  }
}

function canConnect(port) {
  const noop = () => common.mustCall();

  // connect(port, cb) and connect(port)
  const portArgBlocks = doConnect([port], noop);
  for (const block of portArgBlocks) {
    block();
  }

  // connect(port, host, cb) and connect(port, host)
  const portHostArgBlocks = doConnect([port, 'localhost'], noop);
  for (const block of portHostArgBlocks) {
    block();
  }

  // connect({port}, cb) and connect({port})
  const portOptBlocks = doConnect([{ port }], noop);
  for (const block of portOptBlocks) {
    block();
  }

  // connect({port, host}, cb) and connect({port, host})
  const portHostOptBlocks = doConnect([{ port: port, host: 'localhost' }],
                                      noop);
  for (const block of portHostOptBlocks) {
    block();
  }
}

function asyncFailToConnect(port) {
  const onError = () => common.mustCall(function(err) {
    const regexp = /^Error: connect E\w+.+$/;
    assert(regexp.test(String(err)), String(err));
  });

  const dont = () => common.mustNotCall();
  // connect(port, cb) and connect(port)
  const portArgBlocks = doConnect([port], dont);
  for (const block of portArgBlocks) {
    block().on('error', onError());
  }

  // connect({port}, cb) and connect({port})
  const portOptBlocks = doConnect([{ port }], dont);
  for (const block of portOptBlocks) {
    block().on('error', onError());
  }

  // connect({port, host}, cb) and connect({port, host})
  const portHostOptBlocks = doConnect([{ port: port, host: 'localhost' }],
                                      dont);
  for (const block of portHostOptBlocks) {
    block().on('error', onError());
  }
}
