/**
 * rei-kodama.js (v1.0.0)
 *
 * Copyright (c) 2015 Scott Southworth & Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this
 * file except in compliance with the License. You may obtain a copy of the License at:
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 *
 * @authors Scott Southworth @DarkMarmot scott.southworth@gmail.com
 *
 */

;(function (context){

    var Rei = context.seele.monolith('rei');

    Rei.prototype.kodama = Rei.prototype.bamboo = function(tooltipData){

        var els = this.toArray();
        var arr = d3.range(els.length).map(function(){return tooltipData;});
        d3.selectAll(els).data(arr).call(d3.kodama.tooltip());

        return this;

    };


})(this);
