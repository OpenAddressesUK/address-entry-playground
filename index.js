function permutate (src, minLen, maxLen){
    minLen = minLen-1 || 0;
    maxLen = maxLen || src.length+1;
    var Asource = src.slice(); // copy the original so we don't apply results to the original.
    var Aout = [];
    var minMax = function(arr){
        var len = arr.length;
        if(len > minLen && len <= maxLen){
            Aout.push(arr);
        }
    }
    var picker = function (arr, holder, collect) {
        if (holder.length) {
           collect.push(holder);
        }
        var len = arr.length;
        for (var i=0; i<len; i++) {
            var arrcopy = arr.slice();
            var elem = arrcopy.splice(i, 1);
            var result = holder.concat(elem);
            minMax(result);
            if (len) {
                picker(arrcopy, result, collect);
            } else {
                collect.push(result);
            }
        }
    }
    picker(Asource, [], []);
    return Aout;
}

var fetchJSON = function (url, callback) {
    var output = null;
    $.getJSON(url, function (data) {
        output = data;
    })
    .done(function() {
        console.log("Fetching " + url + "...");
        callback(null, output);
    })
    .fail(function() {
        callback(new Error("Some error trying to fetch " + url));
    });
}

var search = function (searchRequest, maxResults, callback) {
    if (!callback) { callback = maxResults; maxResults = null; }
    var results = [ ],
        moreResults = false,
        pageNo = 0;
    async.doUntil(function (callback) {
        pageNo++;
        var url = "https://alpha.openaddressesuk.org/addresses.json?"
            + "page=" + pageNo
            + (searchRequest.street ? "&street=" + encodeURIComponent(searchRequest.street) : "")
            + (searchRequest.town ? "&town=" + encodeURIComponent(searchRequest.town) : "")
            + (searchRequest.postcode ? "&postcode=" + encodeURIComponent(searchRequest.postcode) : "");
        fetchJSON(url, function (err, data) {
            results = results.concat(data.addresses);
            moreResults = (data.addresses.length > 0) && (results.length < maxResults);
            callback(null);
        });
    }, function () {
        return !moreResults;
    }, function (err) {
        callback(err, maxResults ? _.first(results, maxResults) : results);
    });
}

var calculateSearchCombinations = function (freeText, callback) {
    freeText = freeText.toUpperCase();
    // search for a postcode (or more than one!)
    var postcodes = freeText.match(/([A-PR-UWYZ0-9][A-HK-Y0-9][AEHMNPRTVXY0-9]?[ABEHMNPRVWXY0-9]? *[0-9][ABD-HJLN-UW-Z]{2}|GIR 0AA)/g);
    if (postcodes) {
        // remove the postcodes from the original string
        postcodes.forEach(function (p) { freeText = freeText.replace(new RegExp(p), ""); });
        // rationalise the postcodes I've found
        postcodes = _.unique(postcodes.map(function (x) { return x.replace(/ */g, ""); }));
    }
    // search for numbers
    var numbers = freeText.match(/\d+[A-Z]?/g);
    if (numbers) {
        // remove the numbers from the original string
        numbers.forEach(function (p) { freeText = freeText.replace(new RegExp(p), ""); });
        // rationalise the numbers I've found
        numbers = _.unique(numbers);
    }
    freeText = _.without(freeText.split(/ +/), "");
    var combinations = _.flatten(permutate(freeText, 2, 2).map(function (x) { return { 'street': x[0], 'town': x[1] }; }), true);
    if (postcodes) {
        combinations = _.flatten(combinations.map(function (c) {
            return postcodes.map(function (p) {
                var temp = JSON.parse(JSON.stringify(c));
                temp.postcode = p;
                return temp;
            });
        }), true);
    }
    if (numbers) {
        combinations = _.flatten(combinations.map(function (c) {
            return numbers.map(function (n) {
                var temp = JSON.parse(JSON.stringify(c));
                temp.pao = n;
                return temp;
            }).concat(numbers.map(function (n) {
                var temp = JSON.parse(JSON.stringify(c));
                temp.sao = n;
                return temp;
            }));
        }), true);
    }
    callback(null, combinations);
}

var searchCombinations = function (freeText, callback) {
    calculateSearchCombinations(freeText, function (err, combinations) {
        async.map(combinations, function (searchRequest, callback) {
            console.log("Searching for " + JSON.stringify(searchRequest));
            search(searchRequest, callback)
        }, function (err, results) {
            results = _.unique(_.flatten(results, true), false, function (x) { return x.url; })
                .filter(function (r) {
                    return _.find(combinations, function (c) {
                        return (!c.pao && !c.sao) || (c.pao === r.pao) || (c.sao === r.sao);
                    });
                });
            callback(err, results);
        });
    });
}
