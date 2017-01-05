;(function SEELE (context) {

    var _hiddenCouncil = {}; // plugin factories
    var _agents = {};        // plugin instances

    // this gets passed into each plugin. the plugin can then call it to
    // have seele destroy it at the end of its lifecycle

    var _cyanideCapsule = function _cyanideCapsule (name, _agent) {
        var _i;
        var activeAgents = _agents[name];

        if (activeAgents)
           _i = activeAgents.indexOf(_agent);

        if (_i !== void 0 && _i !== -1)
            activeAgents.splice(_i, 1);

        if (activeAgents.length === 0)
            delete _agents[name];

    };

    var seele = {}; // namespace


    // register a plugin by unique name, monolith: module if true, factory if false
    seele.register = function (name, member, monolith) {

        if (_hiddenCouncil[name])
            throw new Error("Members of SEELE cannot be replaced (I already have a plugin named " + name + ")");

        _hiddenCouncil[name] = {member: member, monolith: monolith, name: name};
    };


    seele.monolith = function (name){

        var shadow = _hiddenCouncil[name];

        if (!shadow)
            throw new Error("Addressing a member of SEELE who is not belies your ignorance (no plugin named: " + name + ")");

        if (!shadow.monolith)
            throw new Error("This member of SEELE acts only through his agents (instances " + name + " via method `seele.use`)");

        return shadow.member;

    };

    // elect to use a registered plugin by name and pass the interface object
    seele.use = function (name, api, opts) {

        var shadow = _hiddenCouncil[name];

        if (!shadow)
            throw new Error("Addressing a member of SEELE who is not belies your ignorance (no plugin named: " + name + ")");

        if (shadow.monolith)
            throw new Error("This member of SEELE has direct influence (access " + name + " as module via method `seele.monolith`)");

        var _agent = new shadow.member(api, _falseTooth, opts);

        function _falseTooth () {
            _cyanideCapsule(name, _agent);
        }

        var agents = _agents[name] = _agents[name] || [];
        agents.push(_agent);

    };

    context.seele = seele; // bind to outer context

})(this);
