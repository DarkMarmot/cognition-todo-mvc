;(function (context) {
    var ajaxPlugin = function ajaxPlugin (iface, sepuku) {
        var _xhr = null;

        function handleDestroy () {
            iface.write(null, "abort");
            sepuku();
        }

        function _isActive () {
            return _xhr && _xhr.readyState && _xhr.readyState !== 4;
        }

        function abort () {
            if (_isActive())
                _xhr.abort();
        }

        function request (_settings) {

            iface.write("busy", "condition");

            var settings = {};

            settings.data        = _settings.data || _settings.params;
            settings.url         = _settings.resolvedUrl;
            settings.type        = _settings.method || _settings.verb || 'GET';
            settings.dataType    = _settings.accept || _settings.type || _settings.format || "html";
            settings.contentType = _settings.contentType || "json";
            settings.headers     = _settings.headers;
            settings.timeout     = _settings.timeout || 60000;
            if (settings.type === 'POST') {
                settings.contentType = "application/json";
            }

            _xhr = jQuery.ajax(settings)
                .done(function (resp) {
                    iface.write("done", "condition");
                    iface.write(resp);

                }).fail(function (err) {
                    iface.write("error", "condition");
                    iface.write(err, "error");
                })
        }

        iface.on("abort").run(abort);
        iface.on("do_request").run(request);
        iface.on("destroy").run(handleDestroy);
    };

    if (context.seele) {
      context.seele.register("ajax", ajaxPlugin);
    } else if (context.require) {
        // stuff
    } else if (context.module && context.module.exports) {
        // other stuff
    }

})(window);
