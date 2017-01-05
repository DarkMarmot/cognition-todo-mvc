;(function (context) {
    function tachikoma (api, commitSepuku, opts) {
        this.api = api;
        this.opts = opts || {};
        this.msgQ = [];
        this.max = this.opts.maxReconnect || 10;

        var reProtocol = /^ws:\/\//;

        if (!reProtocol.test(opts.url))
            this.url = "ws://" + opts.url;
        else
            this.url = opts.url;

        this.commitSepuku = commitSepuku;

        this.create = function create (attempts) {
            attempts = attempts || 0;

            if (attempts === this.max) throw new TachikomaError("Can't establish socket connection - max retry limit reached");

            var self = this;

            try {
                this.ws = new WebSocket(this.url); // TODO 2 this actually gets created

                attempts++;

                // TODO 3 and these get bound
                this.ws.onopen = function (ev) {
                    api.write(null, "open");
                    self.handleSendQueue();
                };

                /**
                 * TODO 5 which is why we can use the error and close events to
                 * manage retry cycles and other aspects of errors
                 * NOTE, though, that the error event _doesn't actually
                 * describe the error_ for whatever reason. The close event
                 * does.
                 */
                this.ws.onclose = function (ev, arg) {
                    console.info(ev);
                    api.write(ev, "close");
                };

                // TODO 4 which means that this gets called when something like
                // a connection_failure happens
                this.ws.onerror = function (ev) {
                    //console.error(ev);
                    api.write(ev, "error");
                };

                this.ws.onmessage = function (msg) {
                    var payload;

                    try {
                        payload = JSON.parse(msg.data);

                    } catch (e) {
                        var err = new TachikomaError("JSON parse error");
                        err.caught = e;
                        err.msg = msg;
                        throw err;
                    }

                    api.write(payload, "message");
                };

            } catch (e) { // TODO 1 this isn't actually being hit when the ws fails to connect
                // TODO 6 allegedly this will still go off when a port is being
                // blocked, though, which is kind of bonkers
                console.error(e);

                if (e.code !== 12) { // 12 is invalid url // TODO rigourous error handling
                    // so for anything other than a bum URL
                    this.create.call(this, attempts);
                }
            }
        };

        this.create.call(this);

        this.api.on("send").run(this.handleSend.bind(this));
        this.api.on("reopen").run(this.handleReopen.bind(this));
    }

    tachikoma.prototype.handleSendQueue = function handleSendQueue () {
        var msg;

        while (msg = this.msgQ.shift()) {
            this.send(msg);
        }
    };

    tachikoma.prototype.handleDestroy = function handleDestroy () {
        //this.api.write(null, "destroying");
        this.ws.close();
        this.commitSepuku();
        this.api.write(null, "destroyed");
    };

    tachikoma.prototype.handleSend = function handleSend (msg) {
        this.msgQ.push(msg);

        if (this.ws && this.ws.readyState === 1) {
            this.handleSendQueue();
        }
    };

    tachikoma.prototype.send = function send (msg) {
        var payload;

        try {
            payload = JSON.stringify(msg);
        } catch (e) {
            var err = new TachikomaError("JSON parse error");
            err.caught = e;
            err.msg = msg;
            api.write(err, "error");
            console.error(err);
        }

        try {
            this.ws.send(payload);
        } catch (e) {
            var err = new TachikomaError(e.message || "Barfed on send");
            err.caught = e;
            err.msg = msg;
            api.write(err, "error");
            //console.error(err);

            this.ws.close();

            var self = this;

            window.setTimeout(function () {
                console.info("Attempting to recreate WebSocket");
                self.create(this.attempts);
                self.msgQ.unshift(msg);
                self.handleSendQueue();
            }, 1000);
        }
    };

    tachikoma.prototype.handleReopen = function handleReopen () {
        this.create.call(this);
    };

    function TachikomaError () {
        var temp = Error.apply(this, arguments);

        var key;

        for (key in Object.getOwnPropertyNames(temp)) {
            this[key] = temp[key];
        }

        this.name = "TachikomaError";
    }

    if (context.seele) {
      context.seele.register("websocket", tachikoma);
    } else if (context.require) {
        // stuff
    } else if (context.module && context.module.exports) {
        // other stuff
    }
})(window);

// connecting 0
// open 1
// closing 2
// closed 3
//
// .close(code, reason)
// .send(stuff)
