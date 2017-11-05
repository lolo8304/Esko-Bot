/*-----------------------------------------------------------------------------
A simple echo bot for the Microsoft Bot Framework. 
-----------------------------------------------------------------------------*/

var builder = require('botbuilder');
var restify = require('restify');
var request = require('request');
var sprintf = require('sprintf-js');
const uuidV4 = require('uuid/v4');
var StringBuffer = require('string-buffer');
var util = require('util');
var fs = require('fs');

require('dotenv').config();
var _ = require('lodash');
var moment = require('moment');
var database = require('./modules/db.js')();
var db = database.db;


// Setup Restify Server
var server = restify.createServer();
var port = process.env.port || process.env.PORT || 3978;

server.listen(port, function () {
  console.log('%s listening to %s', server.name, server.url);
});

// Create chat connector for communicating with the Bot Framework Service
var connector = new builder.ChatConnector({
  appId: process.env.MICROSOFT_APP_ID,
  appPassword: process.env.MICROSOFT_APP_PASSWORD
});

// Listen for messages from users 
server.post('/api/messages', connector.listen());

var bot = new builder.UniversalBot(connector, {
  localizerSettings: { 
        defaultLocale: "de" 
    }
});

// Entity Constants
const ENTITIES = {
  ERWACHSENER: 'Person::Erwachsener',
  KINDER: 'Person::Kind',
  JUGENDLICHE: 'Person::Jugendlicher',
  NUMBER: 'Anzahl'
};



//=========================================================
// Activity Events
//=========================================================

bot.on('conversationUpdate', function (message) {
    console.log(">> conversationUpdate")
   // Check for group conversations
    if (message.address.conversation.isGroup) {
        console.log(">> conversationUpdate - isGroup")
        // Send a hello message when bot is added
        if (message.membersAdded) {
            /* use no $ variable because session is not available */
            var cardImage = builder.CardImage.create(null, process.env.ESKO_ENDPOINT_URL+"/images/esko.bot.png");
            var card = new builder.HeroCard()
                .title(bothelper.getT(null, "$.Intro.Title"))
                .text(bothelper.getT(null, "$.Intro.Willkommen"))
                .images([
                    cardImage
                ]);
            var msg = new builder.Message()
                .address(message.address)
                .addAttachment(card);
            bot.send(msg);
        }

        // Send a goodbye message when bot is removed
        if (message.membersRemoved) {
            message.membersRemoved.forEach(function (identity) {
                if (identity.id === message.address.bot.id) {
                    /* use no $ variable because session is not available */
                    var reply = new builder.Message()
                        .address(message.address)
                        .text(bothelper.getT(null, "$.Intro.Tschuess"));
                    bot.send(reply);
                }
            });
        }
    }
});

bot.on('contactRelationUpdate', function (message) {
    console.log(">> contactRelationUpdate")
    if (message.action === 'add') {
        console.log(">> contactRelationUpdate - add")
        var name = message.user ? message.user.name : null;
        /* use no $ variable because session is not available */
        var cardImage = builder.CardImage.create(null, process.env.ESKO_ENDPOINT_URL+"/images/esko.bot.png");
        var card = new builder.HeroCard()
            .title(bothelper.getT(null, "$.Intro.Title"))
            .text(bothelper.getT(null, "$.Intro.Willkommen"))
            .images([
                cardImage
            ]);
        var msg = new builder.Message()
            .address(message.address)
            .addAttachment(card);
        bot.send(msg);
        
    } else {
        console.log(">> contactRelationUpdate - "+message.action)
        // delete their data
    }
});

bot.on('deleteUserData', function (message) {
    // User asked to delete their data
});



//=========================================================
// LUIS initialization
//=========================================================


// Add global LUIS recognizer to bot
var model = process.env.MICROSOFT_LUIS_MODEL;
var recognizer = new builder.LuisRecognizer(model);
var intents = new builder.IntentDialog({ recognizers: [recognizer] });
bot.dialog('/', intents
    .matches('intro', '/Intro')
    .matches('GetStarted', '/GetStarted')
    .matches('help', '/Help')
);

bothelper = require("./modules/bot-helper.js")(bot, builder, recognizer);
email = require("./modules/email.js")();
price = require("./modules/price.js")();
svg = require("./modules/svg.js")(db, email, price);


//=========================================================
// start SVG image 
//=========================================================

//=========================================================
// start table image 
//=========================================================

// Make our db accessible to our router
server.use(function(req,res,next){
    req.db = db;
    req.server = server;
    req.queryJson = querystring.parse(url.parse(req.url).query);
    req.param = function(name){
        var p = this.params[name];
        if (p) {
            return p
        }
        return this.queryJson[name];
    };
    res.header('Access-Control-Allow-Origin', "*");
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type');

    next();
});


server.get('/swagger.local.yaml', function (req, res, next) {
  var contents = fs.readFileSync('./swagger/swagger.local.yaml', 'utf8');
  res.setHeader('content-type', 'text/yaml');
  res.end(new Buffer(contents));
});
server.get('/swagger.local.json', function (req, res, next) {
  var contents = fs.readFileSync('./swagger/swagger.local.json', 'utf8');
  res.setHeader('content-type', 'application/json');
  res.end(new Buffer(contents));
});
server.get('/swagger.yaml', function (req, res, next) {
  var contents = fs.readFileSync('./swagger/swagger.yaml', 'utf8');
  res.setHeader('content-type', 'text/yaml');
  res.end(new Buffer(contents));
});
server.get('/swagger.json', function (req, res, next) {
  var contents = fs.readFileSync('./swagger/swagger.json', 'utf8');
  res.setHeader('content-type', 'application/json');
  res.end(new Buffer(contents));
});


var querystring = require('querystring');
var url = require('url');

function RestApiError(code, message) {
    this.name = "RestApiError";
    this.message = "["+code+"] "+(message || "");
}
RestApiError.prototype = Error.prototype;

function getHttpErrorCode(e) {
    var hasError = /^\[.*\].*$/.test(e.message);
    if (hasError) {
        var myRegexp = /^\[(.*)\].*$/;
        var match = myRegexp.exec(e.message);
        return parseInt(match[1], 10);
    } else {
        return 500;
    }
}

function isError(e, docs, defaultString) {
    if (e && e.name == "RestApiError") {
        return true;
    } else if (e) {
        return true;
    } else if (!docs && defaultString != undefined) {
        return true;
    }
    return false;
}
function handleError(res, e, docs, defaultString) {
    if (e && e.name == "RestApiError") {
        console.log("handle error: e="+e+", docs="+docs+", str="+defaultString);
        res.status(getHttpErrorCode(e))
        res.send(e.message);
        //res.render('500', {error: err, stack: err.stack});
        return true;
    } else if (e) {
        console.log("handle error: e="+e+", docs="+docs+", str="+defaultString);
        res.status(500)
        res.send(e.message);
        return true;
    } else if (!docs && defaultString != undefined) {
        console.log("handle error: e="+e+", docs="+docs+", str="+defaultString);
        res.status(404)
        res.send(defaultString);
        return true;
    }
    return false;
}

function isEmpty(obj) {
    return obj == undefined || obj.length == 0;
}
function isInvalidWildcard(obj) {
    return /^.*[\.\*].*$/.test(obj);
}


function isNumeric(obj) {
    // parseFloat NaNs numeric-cast false positives (null|true|false|"")
    // ...but misinterprets leading-number strings, particularly hex literals ("0x...")
    // subtraction forces infinities to NaN
    // adding 1 corrects loss of precision from parseFloat (#15100)
    return !Array.isArray(obj) && (obj - parseFloat(obj) + 1) >= 0;
}
function isInteger(obj) {
    return isNumeric(obj) && obj.indexOf('.') < 0;
}

function thisURL(req, dictionary = {}) {
    var path = req.server.url + req.url;
    var u = url.parse(path, true);
    u.href = u.href.replace(u.host, req.headers["host"]);
    u.host = req.headers["host"];
    u.hostname = req.headers["host"].split(":")[0];

    for (item in dictionary) {
        u.query[item] = dictionary[item];
    }
    var query = "?"+querystring.stringify(u.query);
    u.server = u.href.substr(0, u.href.length - u.path.length);
    u.href = u.server + u.pathname + query;
    return u;
}


function fullUrl(req, dictionary = {}) {
    return thisURL(req, dictionary).href;
}


function linkURL(req, skip, limit, max, overwrite) {
    //console.log(skip +" / "+limit + "/ "+max);
    if (!overwrite) {
        if (skip < 0) {
            return null;
        }
        if (skip + limit > max) {
            return null;
        }
        if (skip >= max) {
            return null;
        }
    }
    return fullUrl(req, { "skip" : skip, "limit" : limit});
}

function buildResponseLimited(req, res, skip, limit, e, docs, totalCount) {
    if (handleError(res, e, docs, undefined)) {
        return;
    }
    var lastSkip = (Math.floor(totalCount / limit)) * limit;
    if (lastSkip == totalCount) { lastSkip = Math.max(0, lastSkip - limit); }
    var prevSkip = skip - limit;
    var nextSkip = skip + limit;
    res.json(200, {
        "links" : {
            "cur" : linkURL(req, skip, limit, totalCount, true),
            "first" : linkURL(req, 0, limit, totalCount, true),
            "prev" : linkURL(req, prevSkip, limit, totalCount, false),
            "next" : linkURL(req, nextSkip, limit, totalCount, false),
            "last" : linkURL(req, lastSkip, limit, totalCount, true),
            "count" : docs.length,
            "totalCount" : totalCount
        },
        "data" : docs
    })
}

function buildOptions(req, idName, sortColumn, fieldsFilter) {
    var limit = parseInt(req.param('limit'));
    var skip = parseInt(req.param('skip')); 

    if (!limit) { 
        limit = 10; 
    }
    if (limit > 25 || limit < -25 ) {
        throw new RestApiError("400", 'limit <'+limit+'> is too high. Use skip (max +/-25) & limit to get data');
    }
    if (!skip) { 
        skip = 0; 
    }
    if (isEmpty(sortColumn)) {
        var options = {
            "limit": limit,
            "skip": skip
        }
    } else {
        var options = {
            "limit": limit,
            "skip": skip,
            "sort": sortColumn
        }
    }
    if (fieldsFilter != undefined) {
        options["fields"] = fieldsFilter;
    }
    return options;
}
function findLimited(req, res, collection, idName, query, sortColumn, fieldFilter) {
    var options = buildOptions(req, idName, sortColumn, fieldFilter);
    var limit = options.limit;
    var skip = options.skip; 
    collection.count(query, function (e1, totalCount) {
        if (handleError(res, e1, totalCount, undefined)) {
            return;
        }
        collection.find(query, options, function(e, docs){
            buildResponseLimited(req, res, skip, limit, e, docs, totalCount);
        });
    });

}


function verifyRESTSecurity(req) {
    var keyFound = (req.header("app_key") === process.env.APP_KEY)
    var secretFound = (req.header("app_secret") === process.env.APP_SECRET);
    return keyFound && secretFound;
}
/************* start model **************************/


function registerModelAPIs(type, typeMultiple, idName, isIdInteger, hasLimitCollection, zipSearch, customerRelation) {
    if (isIdInteger === undefined) isIdInteger = false; // default string
    if (zipSearch === undefined) zipSearch = { "hasZipSearch" : false, "fieldName" : "" }; // default string
    if (customerRelation === undefined) customerRelation = { "hasRelation" : false, "sort" : "id" }; // default string

    /*
    * GET models.
    */
    server.get('/model/'+typeMultiple, function(req, res, next) {
        if (!verifyRESTSecurity(req)) {
            return handleError(res,
                new RestApiError("403", 'illegal KEY and SECRET'));
        }
        var db = req.db;
        var collection = db.get(typeMultiple);
        if (hasLimitCollection) {
            try {
                var sortColumn = {};
                sortColumn[idName] = 1;
                findLimited(req, res, collection, idName, {}, sortColumn);
            } catch (e) {
                if (handleError(res, e, null, "no results found")) {
                    return;
                }
            }
        } else {
            var options = {
                "sort": idName
            }
            collection.find({ }, options, function(e,docs){
                res.json(200, docs)
            });
        }
    });


    if (isIdInteger) {
        /*
        * GET model by id (integer)
        */
        server.get('/model/'+typeMultiple+'/:id', function(req, res, next) {
            if (!verifyRESTSecurity(req)) {
                return handleError(res,
                    new RestApiError("403", 'illegal KEY and SECRET'));
            }
                var db = req.db;
            var collection = db.get(typeMultiple);
            if (!isInteger(req.params.id)) {
                return handleError(res,
                    new RestApiError("400", 'id '+req.params.id+'is not integer'));
            } else {
                var idToSearch = parseInt(req.params.id);
                collection.findOne({ id : idToSearch }, function(e,docs){
                    if (handleError(res, e, docs, 'No '+type+' found with id '+idToSearch)) {
                        return;
                    }
                    res.json(200, docs)
                });
            } 
        });
        
    } else {

        /*
        * GET model by id (string)
        */
        server.get('/model/'+typeMultiple+'/:id', function(req, res, next) {
            if (!verifyRESTSecurity(req)) {
                return handleError(res,
                    new RestApiError("403", 'illegal KEY and SECRET'));
            }
                var db = req.db;
            var collection = db.get(typeMultiple);
            var idToSearch = req.params.id;
            if (idName == "_id") {
                collection.findOne({ _id : idToSearch }, function(e,docs){
                    if (handleError(res, e, docs, 'No '+type+' found with _id '+idToSearch)) {
                        return;
                    }
                    res.json(200, docs);
                });
            } else {
                collection.findOne({ id : idToSearch }, function(e,docs){
                    if (handleError(res, e, docs, 'No '+type+' found with id '+idToSearch)) {
                        return;
                    }
                    res.json(200, docs);
                });
            }
        });
    }

    server.get('/model/'+typeMultiple+'/search/byQuery/:query/:sort/:filter', function(req, res, next) {
        if (!verifyRESTSecurity(req)) {
            return handleError(res,
                new RestApiError("403", 'illegal KEY and SECRET'));
        }
        var db = req.db;
        var collection = db.get(typeMultiple);
        var queryStringToSearch = req.params.query;
        var sortString = req.params.sort;
        var filterString = req.params.filter;
        if (isEmpty(queryStringToSearch)) {
                return handleError(res,
                    new RestApiError("400", 'parameter query is empty'));
        } else if (isEmpty(sortString)) {
                return handleError(res,
                    new RestApiError("400", 'parameter sort is empty'));
        } else {
            try {
                var queryToSearch = JSON.parse(queryStringToSearch);
                try {
                    var sortToSearch = JSON.parse(sortString);
                    var filterToSearch = undefined;
                    if (filterString != undefined && filterString != "" && filterString != "{}") {
                        try {
                            filterToSearch = JSON.parse(filterString);
                        } catch (e) {
                            return handleError(res,
                                new RestApiError("400", 'filter is not a valid JSON string <br>&nbsp;'+filterString));
                        }
                    }
                    findLimited(req, res, collection, idName, queryToSearch, sortToSearch, filterToSearch);
                } catch (e) {
                    return handleError(res,
                        new RestApiError("400", 'sort is not a valid JSON string <br>&nbsp;'+sortString));
                }
            } catch (e) {
                return handleError(res,
                    new RestApiError("400", 'query is not a valid JSON string <br>&nbsp;'+queryStringToSearch));
            }
        }
    });

    if (zipSearch.hasZipSearch) {
        if (!verifyRESTSecurity(req)) {
            return handleError(res,
                new RestApiError("403", 'illegal KEY and SECRET'));
        }
        server.get('/model/'+typeMultiple+'/search/byZip/:zip', function(req, res, next) {
            var db = req.db;
            var collection = db.get(typeMultiple);
            var options = {
                "sort": idName
            }
            if (!isInteger(req.params.zip)) {
                return handleError(res,
                    new RestApiError("400", 'parameter zip '+req.params.zip+' is not integer'));
            } else {
                var zipToSearch = parseInt(req.params.zip);
                var sortedColumn = {};
                sortedColumn[idName] = 1;
                var zipColumn = {};
                zipColumn[zipSearch.fieldName] = zipToSearch;
                findLimited(req, res, collection, idName, zipColumn, sortedColumn);
            } 
        });
    }

    server.get('/model/'+typeMultiple+'/search/byWord/:text', function(req, res, next) {
        if (!verifyRESTSecurity(req)) {
            return handleError(res,
                new RestApiError("403", 'illegal KEY and SECRET'));
        }
        var db = req.db;
        var collection = db.get(typeMultiple);
        var options = {
            "sort": idName
        }
        var textToSearch = req.params.text;
        if (isEmpty(textToSearch)) {
            return handleError(res,
                new RestApiError("400", 'parameter text is empty'));
        } else if (isInvalidWildcard(textToSearch)) {
            return handleError(res,
                new RestApiError("400", 'parameter text '+req.params.name+' is not a valid wildcard. Neither can contain a * nor a .'));
        } else {
            var sortColumn = {};
            sortColumn[idName] = 1;
            findLimited(req, res, collection, idName, 
                { "$text": { 
                    "$search": textToSearch,
                    "$diacriticSensitive": true
                } }, sortColumn );
        }
    });

    server.get('/model/'+typeMultiple+'/search/near/:longitude,:latitude,:meter', function(req, res, next) {
        if (!verifyRESTSecurity(req)) {
            return handleError(res,
                new RestApiError("403", 'illegal KEY and SECRET'));
        }
        var db = req.db;
        var collection = db.get(typeMultiple);
        if (!isNumeric(req.params.longitude)) {
            return handleError(res,
                new RestApiError("400", 'longitude '+req.params.longitude+'is not numeric'));
        }
        if (!isNumeric(req.params.latitude)) {
            return handleError(res,
                new RestApiError("400", 'latitude '+req.params.latitude+'is not numeric'));
        }
        if (!isInteger(req.params.meter)) {
            return handleError(res,
                new RestApiError("400", 'meter '+req.params.meter+'is not integer'));
        }
        var longitudeSearch = parseFloat(req.params.longitude);
        var latitudeSearch = parseFloat(req.params.latitude);
        var meterSearch = parseInt(req.params.meter);

        var query = {
            "location" : {
                "$nearSphere" :
                    {
                        "$geometry" : { 
                            "type" : "Point", 
                            "coordinates" : [ longitudeSearch, latitudeSearch ] },
                        "$maxDistance" : meterSearch
                    }
        }
        };

        findLimited(req, res, collection, idName, query, {} );
    });

    server.get('/model/'+typeMultiple+'/:typ/:alter/:farbe', function(req, res, next) {
        if (!verifyRESTSecurity(req)) {
            return handleError(res,
                new RestApiError("403", 'illegal KEY and SECRET'));
        }
        var db = req.db;
        var collection = db.get(typeMultiple);
        var options = {
            "sort": "id"
        }
        var typToSearch = req.params.typ;
        var alterToSearch = req.params.alter;
        var farbeToSearch = req.params.farbe;
        if (isEmpty(typToSearch)) {
            return handleError(res,
                new RestApiError("400", 'parameter typ is empty'));
        }
        if (isEmpty(alterToSearch)) {
            return handleError(res,
                new RestApiError("400", 'parameter alter is empty'));
        }
        if (isEmpty(farbeToSearch)) {
            return handleError(res,
                new RestApiError("400", 'parameter farbe is empty'));
        }
        var filter = {};
        if (typToSearch != "*") {
            filter["typ"] = typToSearch;
        }
        if (alterToSearch != "*") {
            filter["alter"] = alterToSearch;
        }
        if (farbeToSearch != "*") {
            filter["farbe"] = farbeToSearch;
        }
        findLimited(req, res, collection, "id", filter, {"id" : 1});
    });

    server.get('/model/'+typeMultiple+'/:typ/:alter/:farbe/:kategorie', function(req, res, next) {
        if (!verifyRESTSecurity(req)) {
            return handleError(res,
                new RestApiError("403", 'illegal KEY and SECRET'));
        }
        var db = req.db;
        var collection = db.get(typeMultiple);
        var options = {
            "sort": "id"
        }
        var typToSearch = req.params.typ;
        var alterToSearch = req.params.alter;
        var farbeToSearch = req.params.farbe;
        var kategorieToSearch = req.params.kategorie;
        if (isEmpty(typToSearch)) {
            return handleError(res,
                new RestApiError("400", 'parameter typ is empty'));
        }
        if (isEmpty(alterToSearch)) {
            return handleError(res,
                new RestApiError("400", 'parameter alter is empty'));
        }
        if (isEmpty(farbeToSearch)) {
            return handleError(res,
                new RestApiError("400", 'parameter farbe is empty'));
        }
        if (isEmpty(kategorieToSearch)) {
            return handleError(res,
                new RestApiError("400", 'parameter kategorie is empty'));
        }
        var filter = {};
        if (typToSearch != "*") {
            filter["typ"] = typToSearch;
        }
        if (alterToSearch != "*") {
            filter["alter"] = alterToSearch;
        }
        if (farbeToSearch != "*") {
            filter["farbe"] = farbeToSearch;
        }
        if (kategorieToSearch != "*") {
            filter["kategorie"] = kategorieToSearch;
        }
        findLimited(req, res, collection, "id", filter, {"id" : 1});
    });
}
registerModelAPIs('ski', 'skis', '_id', false, true); 
registerModelAPIs('langlauf', 'langlauf', '_id', false, true); 
registerModelAPIs('snowboard', 'snowboard', '_id', false, true); 

server.get('/images/:name', function (req, res, next) {
    var imageName = req.params.name;
    if (isEmpty(imageName)) {
        return handleError(res,
            new RestApiError("400", 'image name must be specified'));
    }
    if (imageName.indexOf("..") >= 0 || imageName.indexOf("/") >= 0 || imageName.indexOf("$") >= 0 || imageName.indexOf("~") >= 0) {
        return handleError(res,
            new RestApiError("400", 'invalid image name - only "name.ext" allowed'));
    }
    var ext = imageName.split(".");
    if (ext.length == 0) {
        return handleError(res,
            new RestApiError("400", 'image has not extension'));
    }
    var contents = fs.readFileSync('./images/' + imageName, '');
    res.setHeader('Content-Type', 'image/' + ext[ext.length - 1]);
    res.end(contents);
});


//=========================================================
// End Models
//=========================================================




//=========================================================
// Dialogs
//=========================================================


intents.onDefault(
    builder.DialogAction.endDialog()
    //builder.DialogAction.send("$.Intro.Fehler")
);

bot.dialog('/Help', [
    function (session, args, next) {
        builder.Prompts.text(session,"$.Intro.Hilfe");
    }
]);


bot.dialog('/Test', [
    function (session, args, next) {
        builder.Prompts.text(session,"Typ, Piste, Schuhe");
    },
    function (session, results) {
        var text = results.response
        if (text == "bye") {
            session.endDialog();
        } else {
            var splitted = text.split(" ");
            var data = {
                type: splitted[0],
                piste: splitted[1], 
                schuhe: (splitted[2] ? splitted[2] : "*"),
                pisteSchuhe: 0
            };
            data.pisteSchuhe = data.piste
            if (data.piste == "Aktion" && data.schuhe == "*") {
                data.pisteSchuhe = (data.piste == "Aktion" ? "blau" : data.piste)
            }
            var user = session.message.address.user;
            getRentalResult(user, [data], function (angebot) {
                var content = "Ski: "+price.getPreisText(angebot.preise.ski);
                content += ", Schuhe: "+price.getPreisText(angebot.preise.schuhe);
                content += ", Stock: "+price.getPreisText(angebot.preise.stock);
                content += ", Set: "+price.getPreisText(angebot.preise.set);
                session.send(content);
                session.sendBatch();
                session.replaceDialog("/Test")
            })
        }
    }
  ]);
bot.dialog('/GetStarted', [
    function (session, args, next) {
          session.preferredLocale("de");
          var cardImage = builder.CardImage.create(null, process.env.ESKO_ENDPOINT_URL+"/images/esko.bot.png");
          var card = new builder.HeroCard(session)
              .title(bothelper.getT(session, "$.Intro.Title"))
              .text(bothelper.getT(session, "$.Intro.Willkommen"))
              .images([
                  cardImage
              ]);
          var msg = new builder.Message()
              .address(session.message.address)
              .addAttachment(card);
          session.send(msg);
          session.endDialog();
    }
  ]);

bot.dialog('/Intro', [
  function (session, args, next) {
        session.preferredLocale("de");
        session.send("Lass uns starten.")
        bothelper.choices(session, "$.Intro.Auswahl", "$.Intro.Auswahl.Choices");
        session.sendBatch();
    },
  function (session, results, next) {
    if (results.response.entity === "Ski") {
      session.beginDialog("/Ski");
    }
    if (results.response.entity === "Langlauf") {
      session.send("$.Langlauf.Fehler");
      //session.send("$.Resultat.BestenDankDennoch");
      session.endDialog();
    }
    if (results.response.entity === "Snowboard") {
      session.send("$.Snowboard.Fehler");
      //session.send("$.Resultat.BestenDankDennoch");
      session.endDialog();
    }
    if (results.response.entity === "andere") {
        session.send("$.andere.Fehler");
        session.endDialog();
      }
    },
  function (session, results, next) {
    if (results.response) {
      session.send("$.Resultat.KommInShop");
    }
    session.endDialog();
  }
]);

bot.dialog('/Ski', [
  function (session, args, next) {
    session.userData.angebot = {
        intent: "Ski",
    };
    session.beginDialog("/"+session.userData.angebot.intent+"/PersonenAuswahl")
  },
  function (session, results, next) {
    if (results.countTotal > 0) {
      session.userData.angebot = {
        intent: "Ski",
        type: "ski",
        counts: results,
        todoCount: JSON.parse(JSON.stringify(results)),
        personen: []
      }
      session.beginDialog("/"+session.userData.angebot.intent+"/PersonenEingaben")
    } else {
      session.endDialog();
    }
  },
  function (session, results, next) {
    session.beginDialog("/"+session.userData.angebot.intent+"/Angebot")
  }
]);


function angebotTitlePersonen(angebot, data) {
    var nofK = 0
    var nofJ = 0
    var nofE = 0
    for (var index = 0; index < data.length; index++) {
        var person = data[index];
        if (person.type == "Erwachsener") {
            nofE++
        }
        if (person.type == "Kind") {
            nofK++            
        }
        if (person.type == "Jugendlicher") {
            nofJ++
        }
    }
    var text = "";
    if (nofK == 1) {
        text += " 1 Kind"
    }
    if (nofK > 1) {
        text += " "+nofK+" Kinder"
    }
    if (nofJ == 1) {
        text += " 1 Jugendlicher"
    }
    if (nofJ > 1) {
        text += " "+nofJ+" Jugendliche"
    }
    if (nofE == 1) {
        text += " 1 Erwachsener"
    }
    if (nofE > 1) {
        text += " "+nofE+" Erwachsene"
    }
    return text;
}

bot.dialog("/Ski/Angebot", [
  function (session, args, next) {
        var personen = session.userData.angebot.personen;
        var data = [];
        for (var i = 0; i < personen.length; ++i) {
            var p = personen[i];
            data.push({type: p.realType || p.type, piste: p.piste, schuhe: p.schuhe, pisteSchuhe: p.pisteSchuhe});
        }
//        session.send("Danke - wir haben alle Information erhalten und berechnen nun das Angebot");
        session.sendTyping()
        session.sendBatch();
        svg.setSVGRentalResult(session.message.address.user, data, function (uuid, data, text) {
            var link = process.env.ESKO_ENDPOINT_URL+"/miete.png?uuid="+uuid;
            var card = new builder.HeroCard(session)
                .title("$.Resultat.Titel", session.userData.angebot.personen.length)
                .text(angebotTitlePersonen(session.userData.angebot, data))
                .images([
                    builder.CardImage.create(session, link),
                ])
                .buttons([
                    builder.CardAction.openUrl(session, link, "im Browser öffnen")
                ]);

            var msg = new builder.Message(session).addAttachment(card);
            session.send(msg);
            session.sendBatch();
            session.endDialog();
            session.userData.angebot = undefined;            
    });
  }
]);


function getNextPerson(angebot) {
  var todo = angebot.todoCount;
  if (todo.countTotal > 0) {
    if (todo.countErwachsene > 0) {
      return { 
        type: "Erwachsener", 
        typeMultiple: "Erwachsene",
        typeWithArtikel: "der %s. Erwachsene", 
        indent: "/"+angebot.intent+"/Erwachsener",
        index: angebot.counts.countErwachsene - todo.countErwachsene
      }
    } else if (todo.countJugendliche > 0) {
      return { 
        type: "Jugendlicher", 
        typeMultiple: "Jugendliche",
        typeWithArtikel: "der %s. Jugendliche", 
        indent: "/"+angebot.intent+"/Jugendlicher",
        index: angebot.counts.countJugendliche - todo.countJugendliche
      }
    } else {
      return { 
        type: "Kind", 
        typeMultiple: "Kinder",
        typeWithArtikel: "das %s. Kind", 
        indent: "/"+angebot.intent+"/Kind",
        index: angebot.counts.countKinder - todo.countKinder
      }
    }
  } else {
    return null;
  }
}

bot.dialog("/Ski/PersonenEingaben", [
  function (session, args, next) {
    session.send("$.Ski.BestätigungPersonen", session.userData.angebot.counts.countTotal);
    session.beginDialog("/"+session.userData.angebot.intent+"/Person");
  },
  function (session, results, next) {
    if (results.response) {
      //session.send ("$.Resultat.WarteRechnen", session.userData.angebot.personen.length)
      session.endDialog();
    } else {
      session.cancelDialog();
    }
  }
]).cancelAction('/Intro', "$.Ski.Abbruch", { matches: /(intro|help|start)/i });


bot.dialog("/Ski/Person", [
  function (session, args, next) {
    var nextPerson = getNextPerson(session.userData.angebot);
    if (nextPerson) {
      session.beginDialog(nextPerson.indent, nextPerson);
    } else {
      session.endDialog();
    }
  },
  function (session, results, next) {
    if (results.response) {
      session.userData.angebot.personen.push(results.response);
      session.replaceDialog("/"+session.userData.angebot.intent+"/Person");
    } else {
      session.cancelDialog();
    }
  }
]);

bot.dialog("/Ski/Erwachsener", [
  function (session, args, next) {
    session.dialogData.person = args;
    session.beginDialog("/Ski/PisteErwachsener", args);
  },
  function (session, results, next) {
    if (results.response) {
        session.dialogData.person.piste = results.response.entity;
        session.dialogData.person.pisteSchuhe = session.dialogData.person.piste;
        if (session.dialogData.person.piste == "Aktion") {
            session.dialogData.person.pisteSchuhe = "blau";
        }
        session.userData.angebot.todoCount.countErwachsene--;
        session.userData.angebot.todoCount.countTotal--;
        session.endDialogWithResult({response: session.dialogData.person});
    } else {
      session.cancelDialog();
    }
  }
]);

bot.dialog("/Ski/Kind", [
    function (session, args, next) {
        session.dialogData.person = args;
        session.beginDialog("/Ski/KinderAlter", args);
    },    
    function (session, results, next) {
        if (results.response) {
            session.dialogData.person.alter = results.response.entity;
            if (session.dialogData.person.alter == bothelper.getT(session, "$.Person.KindAlter.Unter12Jahren")) {
                session.dialogData.person.realType = "Kind";
                session.beginDialog("/Ski/SchuheKind", session.dialogData.person);
            } else {
                next();
            }
        } else {
            session.cancelDialog();
        }
    },
    function (session, results, next) {
        if (results && results.response) {
            /* answer from schuhe */
            session.dialogData.person.schuhe = results.response.entity;
            session.beginDialog("/Ski/PisteKind", session.dialogData.person);
        } else {
            /* passed schuhe question, goto piste */
            if (session.dialogData.person.alter == bothelper.getT(session, "$.Person.KindAlter.12_18Jahre")) {
                session.dialogData.person.realType = "Jugendlicher";
                session.beginDialog("/Ski/PisteJugendlicher", session.dialogData.person);
            } else if (session.dialogData.person.alter == bothelper.getT(session, "$.Person.KindAlter.Ueber18Jahre")) {
                session.dialogData.person.realType = "Erwachsener";
                session.beginDialog("/Ski/PisteErwachsener", session.dialogData.person);
            }
        }
    },
    function (session, results, next) {
        if (results.response) {
            session.dialogData.person.piste = results.response.entity;
            session.dialogData.person.pisteSchuhe = session.dialogData.person.piste;
            if (session.dialogData.person.realType == "Jugendlicher" && session.dialogData.person.piste == "Aktion") {
                session.dialogData.person.pisteSchuhe = "blau";
            }
            session.userData.angebot.todoCount.countKinder--;
            session.userData.angebot.todoCount.countTotal--;
            session.endDialogWithResult({response: session.dialogData.person});
        } else {
            session.cancelDialog();
        }
    }
]);

bot.dialog("/Ski/Jugendlicher", [
    function (session, args, next) {
        session.dialogData.person = args;
        session.beginDialog("/Ski/JugendlicherAlter", args);
    },    
    function (session, results, next) {
        if (results.response) {
            session.dialogData.person.alter = results.response.entity;
            if (session.dialogData.person.alter == bothelper.getT(session, "$.Person.JugendlicherAlter.12_18Jahre")) {
                session.dialogData.person.realType = "Jugendlicher";
                session.beginDialog("/Ski/PisteJugendlicher", session.dialogData.person);
            } else if (session.dialogData.person.alter == bothelper.getT(session, "$.Person.JugendlicherAlter.Ueber18Jahre")) {
                session.dialogData.person.realType = "Erwachsener";
                session.beginDialog("/Ski/PisteErwachsener", session.dialogData.person);
            }
        } else {
            session.cancelDialog();
        }
    },
    function (session, results, next) {
        if (results.response) {
            session.dialogData.person.piste = results.response.entity;
            session.dialogData.person.pisteSchuhe = session.dialogData.person.piste;
            if (session.dialogData.person.piste == "Aktion") {
                session.dialogData.person.pisteSchuhe = "blau";
            }
            session.userData.angebot.todoCount.countJugendliche--;
            session.userData.angebot.todoCount.countTotal--;
            session.endDialogWithResult({response: session.dialogData.person});
        } else {
         session.cancelDialog();
        }
    }
]);


bot.dialog("/Ski/KinderAlter", [
    function (session, args, next) {
        var nThPersonText = bothelper.getTT(session, args.typeWithArtikel, args.index+1);
        bothelper.choices(session, "$.Person.KindAlter", "$.Person.KindAlter.Choices", nThPersonText);
    }
  ]).cancelAction('/Intro', "$.Ski.Abbruch", { matches: /(intro|help|start)/i });
  
  bot.dialog("/Ski/JugendlicherAlter", [
    function (session, args, next) {
        var nThPersonText = bothelper.getTT(session, args.typeWithArtikel, args.index+1);
        bothelper.choices(session, "$.Person.JugendlicherAlter", "$.Person.JugendlicherAlter.Choices", nThPersonText);
    }
  ]).cancelAction('/Intro', "$.Ski.Abbruch", { matches: /(intro|help|start)/i });

bot.dialog("/Ski/PisteErwachsener", [
  function (session, args, next) {
    var nThPersonText = bothelper.getTT(session, args.typeWithArtikel, args.index+1);
    bothelper.choices(session, "$.Person.Piste", "$.Person.Piste.Choices", nThPersonText);
  }
]).cancelAction('/Intro', "$.Ski.Abbruch", { matches: /(intro|help|start)/i });

bot.dialog("/Ski/PisteKind", [
  function (session, args, next) {
    var nThPersonText = bothelper.getTT(session, args.typeWithArtikel, args.index+1);
    bothelper.choices(session, "$.Person.Piste", "$.Person.Piste.Kinder.Choices", nThPersonText);
  }
]).cancelAction('/Intro', "$.Ski.Abbruch", { matches: /(intro|help|start)/i });

bot.dialog("/Ski/SchuheKind", [
    function (session, args, next) {
        var nThPersonText = bothelper.getTT(session, args.typeWithArtikel, args.index+1);
        bothelper.choices(session, "$.Person.KindSchuh", "$.Person.KindSchuh.Choices", nThPersonText);
    }
  ]).cancelAction('/Intro', "$.Ski.Abbruch", { matches: /(intro|help|start)/i });
    

bot.dialog("/Ski/PisteJugendlicher", [
    function (session, args, next) {
        var nThPersonText = bothelper.getTT(session, args.typeWithArtikel, args.index+1);
        bothelper.choices(session, "$.Person.Piste", "$.Person.Piste.Jugendlicher.Choices", nThPersonText);
    }
  ]).cancelAction('/Intro', "$.Ski.Abbruch", { matches: /(intro|help|start)/i });
  
function findPrefixNumberOfEntity(entities, entityName) {
  const entity = (builder.EntityRecognizer.findEntity(entities || [], entityName) || {});
  const numberEntities = (builder.EntityRecognizer.findAllEntities(entities || [], ENTITIES.NUMBER) || {});
  var minIndex = 1000000000;
  var minNumber = 0;
  if (entity) {
    for (var i = 0; i < numberEntities.length; ++i) {
      var numberEntity = numberEntities[i];
      var diffIndex = entity.startIndex - numberEntity.endIndex;
      if (diffIndex >= 0) {
        if (diffIndex < minIndex) {
          minNumber = parseInt(numberEntity.resolution.values[0]);
        } 
      }
    }
  }
  return minNumber; 
}

bot.dialog("/Ski/PersonenAuswahl", [
  function (session, args, next) {
    builder.Prompts.text(session,"$.Ski.Personen");
  },
  function (session, results) {
    recognizer.recognize({ message: { text: results.response }, locale: session.defaultLocale }, (err, args) => {
      if (!err) {
        const countErwachsene = findPrefixNumberOfEntity(args.entities, ENTITIES.ERWACHSENER);
        const countKinder = findPrefixNumberOfEntity(args.entities, ENTITIES.KINDER);
        const countJugendliche = findPrefixNumberOfEntity(args.entities, ENTITIES.JUGENDLICHE);
        const countTotal = countErwachsene+countKinder+countJugendliche;
        if (countTotal > 0) {
          session.endDialogWithResult(
            {countTotal: countTotal, countErwachsene: countErwachsene, countKinder: countKinder, countJugendliche : countJugendliche }
          )
        } else {
          session.send("$.Ski.BestätigungPersonenFehler");
          session.replaceDialog("/"+session.userData.angebot.intent+"/PersonenAuswahl")          
        }
      } else {
        session.send("$.Ski.BestätigungPersonenFehler");
        session.replaceDialog("/"+session.userData.angebot.intent+"/PersonenAuswahl")
      }
    });
  }
]);


//based http://svg-whiz.com/svg/table.svg
// [
//    {"type":"Kind","piste":"rot"},
//    {"type":"Erwachsener","piste":"blau"}
//  ]
//
server.get('/miete.svg', function(req, res, next) {
    var uuid = req.param("uuid");
    svg.getCachedObject("angebote", uuid, function (object) {
        if (uuid && object) {
            console.log("found from svgResultCache: "+uuid);
            res.setHeader('Content-Disposition', "inline; filename=test.svg");
            res.setHeader('Content-Type', 'image/svg+xml');
            res.end(new Buffer(object.svg));
        } else {
            res.status(400)
            res.end();
        }
    });
});

server.get('/miete.png', function(req, res, next) {
    var uuid = req.param("uuid");
    svg.getCachedObject("angebote", uuid, function(object) {
        if (uuid && object) {
            console.log("found from svgResultCache: "+uuid);
            res.setHeader('Content-Disposition', "inline; filename="+uuid+".png");
            res.setHeader('Content-Type', 'image/png');
            res.end(new Buffer(object.pngBase64Encoded, 'base64'));
        } else {
            res.status(400)
            res.end();
        }
    });
});
