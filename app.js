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

var localeTexts = JSON.parse(fs.readFileSync("./locale/de/index.json", "utf8"));

function getT(session, text) {
    if (session) {
        return session.localizer.gettext(session.preferredLocale(), text)
    } else {
        return localeTexts[text];
    }
}
function getTT(session, text, ...args) {
    return sprintf.sprintf(getT(session, text), args)
}
function choices(session, text, choices, ...args) {
    var intro = sprintf.sprintf(getT(session, text), args);
    var options = getT(session, choices);
    //builder.Prompts.choice(session, intro, options, {listStyle: builder.ListStyle["inline"]});
    builder.Prompts.choice(session, intro, options, {listStyle: builder.ListStyle["button"]});
    //builder.Prompts.choice(session, intro, options);
}


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
  NUMBER: 'builtin.number'
};



//=========================================================
// Activity Events
//=========================================================

bot.on('conversationUpdate', function (message) {
   // Check for group conversations
      // Send a hello message when bot is added
      if (message.membersAdded) {
          message.membersAdded.forEach(function (identity) {
              if (identity.id != message.address.bot.id) {
                    var name = identity.name ? identity.name : "zämä";
                    if (message.address.conversation.isGroup) {
                    name = "zämä";
                    }

                   /* use no $ variable because session is not available */
                    var cardImage = builder.CardImage.create(null, process.env.ESKO_ENDPOINT_URL+"/images/esko.bot.png");
                    var card = new builder.HeroCard()
                        .title("Esko-Bot")
                        .text(getT(null, "$.Intro.Willkommen"))
                        .images([
                            cardImage
                        ]);
                    var msg = new builder.Message()
                        .address(message.address)
                        .addAttachment(card);
                    bot.send(msg);
                  return;
              }
          });
      }

      // Send a goodbye message when bot is removed
      if (message.membersRemoved) {
          message.membersRemoved.forEach(function (identity) {
              if (identity.id === message.address.bot.id) {
                   /* use no $ variable because session is not available */
                   var reply = new builder.Message()
                      .address(message.address)
                      .text(getT(null, "$.Intro.Tschuess"));
                  bot.send(reply);
              }
          });
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
    .matches('help', '/Hilfe')
    .matches('intro', '/Intro')
    .matches('personen', '/Personen')
);


//=========================================================
// Start Models
//=========================================================

// add mongo connection
var mongo = require('mongodb');
var monk = require('monk');

// Connect to remote DB, settings are extended due to Firefall issues between nodejs -> mongodb
// depending on the installed mongodb driver, settings are different
// poolSize vs maxPoolSize
// keepAlive vs socketOptions.keepAlive
// connectTimeoutMS vs socketOptions.connectTimeoutMS
var dbURL = process.env.DB_APP_USER+':'+process.env.DB_APP_PWD+'@'+process.env.DB_APP_URL
    +'?'
    +       'maxPoolSize=10'
    +'&'+   'poolSize=10'
    +'&'+   'keepAlive=60000'
    +'&'+   'socketOptions.keepAlive=60000'
    +'&'+   'connectTimeoutMS=10000'
    +'&'+   'socketOptions.connectTimeoutMS=10000'
    +'&'+   'reconnectTries=5';

// uncomment for localhost database
if (!process.env.DB_APP_USER) {
    dbURL = process.env.DB_APP_URL;
}
    
var db = monk(dbURL);
console.log("mongodb connected with URL="+dbURL);

//===================
// send mail
//===================

var nodemailer = require('nodemailer');

var transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  requireTLS: false,
  auth: {
    user: process.env.SMTP_AUTH_USER,
    pass: process.env.SMTP_AUTH_PWD
  }
});

function sendBotMail(subject, body, TO) {
    var mailOptions = {
        from: process.env.SMTP_FROM_USER,
        to: TO,
        bcc: process.env.SMTP_CC_USER,
        subject: subject,
        text: body
    };
    
    transporter.sendMail(mailOptions, function(error, info){
    if (error) {
        console.log(error);
    } else {
        console.log('Email sent: ' + info.response);
    }
    });
    
}


//=========================================================
// start table image 
//=========================================================

var numeral = require('numeral');

function px2em(refPX, px) {
    return numeral(px / refPX).format('0.00')+"em";
}
function em2px(refPX, em) {
    var emNum = numeral(em.substr(0, em.indexOf("em"))).value();
    return numeral(numeral(emNum * refPX).format('0.0')).value();
}

function svg_start(buffer) {
    svg_content(buffer, "<svg xmlns=\'http://www.w3.org/2000/svg\' xmlns:xlink=\'http://www.w3.org/1999/xlink\'>");
}
function svg_content(buffer, text) {
    buffer.text = buffer.text + text;
}
function svg_end(buffer) {
    svg_content(buffer, "</svg>");
}
function svg_table_row_internal(buffer, data, isFontWeightBold) {
    var bold = isFontWeightBold ? "font-weight='bold' fill='crimson'" : "";
    svg_content(buffer, "<text x='"+buffer.table.startXY.x+"' y='"+buffer.table.startXY.y+"' text-anchor='middle' "+bold+">\n");
    var posX = buffer.table.startXY.x;
    var dyString = "dy='"+buffer.table.currentHeightEm+"em' font-weight='bold' fill='crimson' text-anchor='start'";
    for (var i = 0; i < data.length; ++i) {
        svg_content(buffer, "<tspan x='"+posX+"' "+dyString+">"+data[i]+"</tspan>\n");
        posX = posX + buffer.table.widthArray[i];
        dyString = "";
    }
    svg_content(buffer, "</text>");    
}

function svg_table_start(buffer, startXY, fontSize, widthArray) {
    buffer.table = {
        startXY: startXY,
        fontSize: fontSize,
        widthArray: widthArray,
        totalWidth: 0,
        highlightRow: 1,
        currentHeightEm: 0
    };
    buffer.table.totalWidth = widthArray.reduce((sum, value) => sum + value, 0);
    svg_content(buffer, "<g font-size='"+buffer.table.fontSize+"px'>\n");
}
function svg_table_row(buffer, data, isStrong) {
    if (!isStrong) {
        buffer.table.currentHeightEm += 1;
        var opacity = 0.0;
        if (buffer.table.highlightRow == 1) {
            buffer.table.highlightRow = 0;
            opacity = 0.2;
        } else {
            buffer.table.highlightRow = 1;
            opacity = 0.4;
        }
        svg_content(buffer, "<rect x='"+(buffer.table.startXY.x-5)+"' y='"+(buffer.table.currentHeightEm+0.2)+"em' width='"+(buffer.table.totalWidth+10)+"' height='1em' fill='gainsboro' style='fill-opacity: "+opacity+"'/>\n");
    }
    svg_table_row_internal(buffer, data, isStrong);
}

function svg_box(buffer, x, y, w, h) {
    svg_content(buffer, "<rect fill='#FFFFFF' x='"+x+"' y='"+y+"' width='"+w+"px' height='"+h+"px'/>\n");
}
function svg_table_end(buffer) {
    svg_content(buffer, "</g>");
}

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
        return match[1];
    } else {
        return "500";
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
        res.status(getHttpErrorCode(e)).send(e.message);
        //res.render('500', {error: err, stack: err.stack});
        return true;
    } else if (e) {
        console.log("handle error: e="+e+", docs="+docs+", str="+defaultString);
        res.status(500).send(e.message);
        return true;
    } else if (!docs && defaultString != undefined) {
        console.log("handle error: e="+e+", docs="+docs+", str="+defaultString);
        res.status(404).send(defaultString);
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

/************* start model **************************/


function registerModelAPIs(type, typeMultiple, idName, isIdInteger, hasLimitCollection, zipSearch, customerRelation) {
    if (isIdInteger === undefined) isIdInteger = false; // default string
    if (zipSearch === undefined) zipSearch = { "hasZipSearch" : false, "fieldName" : "" }; // default string
    if (customerRelation === undefined) customerRelation = { "hasRelation" : false, "sort" : "id" }; // default string

    /*
    * GET models.
    */
    server.get('/model/'+typeMultiple, function(req, res, next) {
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

bot.dialog('/Intro', [
  function (session, args, next) {
        session.preferredLocale("de");
        session.send("Lass uns starten.")
        choices(session, "$.Intro.Auswahl", "$.Intro.Auswahl.Choices");
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
    session.beginDialog("/Ski/PersonenAuswahl")
  },
  function (session, results, next) {
    if (results.countTotal > 0) {
      session.userData.angebot = {
        type: "ski",
        counts: results,
        todoCount: JSON.parse(JSON.stringify(results)),
        personen: []
      }
      session.beginDialog("/Ski/PersonenEingaben")
    } else {
      session.endDialog();
    }
  },
  function (session, results, next) {
    session.beginDialog("/Ski/Angebot")
  }
]);


function angebotTitlePersonen(angebot) {
  var buf = "";
  if (angebot.counts.countErwachsene > 1) {
    buf += angebot.counts.countErwachsene+" Erwachsene ";
  } else if (angebot.counts.countErwachsene == 1) {
    buf += angebot.counts.countErwachsene+" Erwachsener ";
  }
  if (angebot.counts.countKinder > 1) {
    buf += angebot.counts.countKinder+" Kinder ";
  } else if (angebot.counts.countKinder == 1) {
    buf += angebot.counts.countKinder+" Kind ";
  }
  if (angebot.counts.countJugendliche > 1) {
   buf += angebot.counts.countJugendliche+" Jugendliche";
  } else if (angebot.counts.countJugendliche == 1) {
   buf += angebot.counts.countJugendliche+" Jugendlicher";
  }
  return buf;
}

bot.dialog('/Ski/Angebot', [
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
        setSVGRentalResult(session.message.address.user, data, function (uuid, text) {
            var link = process.env.ESKO_ENDPOINT_URL+"/miete.png?uuid="+uuid;
            var card = new builder.HeroCard(session)
                .title("$.Resultat.Titel", session.userData.angebot.personen.length)
                .text(angebotTitlePersonen(session.userData.angebot))
                .images([
                    builder.CardImage.create(session, link),
                ])
                .buttons([
                    builder.CardAction.openUrl(session, link, "im Browser öffnen")
                ]);

            var msg = new builder.Message(session).addAttachment(card);
            session.send(msg);
            //choices(session, "$.Resultat.NochWas", "$.Resultat.NochWas.Choices");
            session.sendBatch();
            session.endDialog();
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
        indent: "/Ski/Erwachsener",
        index: angebot.counts.countErwachsene - todo.countErwachsene
      }
    } else if (todo.countJugendliche > 0) {
      return { 
        type: "Jugendlicher", 
        typeMultiple: "Jugendliche",
        typeWithArtikel: "der %s. Jugendliche", 
        indent: "/Ski/Jugendlicher",
        index: angebot.counts.countJugendliche - todo.countJugendliche
      }
    } else {
      return { 
        type: "Kind", 
        typeMultiple: "Kinder",
        typeWithArtikel: "das %s. Kind", 
        indent: "/Ski/Kind",
        index: angebot.counts.countKinder - todo.countKinder
      }
    }
  } else {
    return null;
  }
}

bot.dialog('/Ski/PersonenEingaben', [
  function (session, args, next) {
    session.send("$.Ski.BestätigungPersonen", session.userData.angebot.counts.countTotal);
    session.beginDialog("/Ski/Person");
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


bot.dialog('/Ski/Person', [
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
      session.replaceDialog("/Ski/Person");
    } else {
      session.cancelDialog();
    }
  }
]);

bot.dialog('/Ski/Erwachsener', [
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

bot.dialog('/Ski/Kind', [
    function (session, args, next) {
        session.dialogData.person = args;
        session.beginDialog("/Ski/KinderAlter", args);
    },    
    function (session, results, next) {
        if (results.response) {
            session.dialogData.person.alter = results.response.entity;
            if (session.dialogData.person.alter == getT(session, "$.Person.KindAlter.Unter12Jahren")) {
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
            if (session.dialogData.person.alter == getT(session, "$.Person.KindAlter.12_18Jahre")) {
                session.dialogData.person.realType = "Jugendlicher";
                session.beginDialog("/Ski/PisteJugendlicher", session.dialogData.person);
            } else if (session.dialogData.person.alter == getT(session, "$.Person.KindAlter.Ueber18Jahre")) {
                session.dialogData.person.realType = "Erwachsener";
                session.beginDialog("/Ski/PisteErwachsener", session.dialogData.person);
            }
        }
    },
    function (session, results, next) {
        if (results.response) {
            session.dialogData.person.piste = results.response.entity;
            session.dialogData.person.pisteSchuhe = session.dialogData.person.piste;
            session.userData.angebot.todoCount.countKinder--;
            session.userData.angebot.todoCount.countTotal--;
            session.endDialogWithResult({response: session.dialogData.person});
        } else {
            session.cancelDialog();
        }
    }
]);

bot.dialog('/Ski/Jugendlicher', [
    function (session, args, next) {
        session.dialogData.person = args;
        session.beginDialog("/Ski/JugendlicherAlter", args);
    },    
    function (session, results, next) {
        if (results.response) {
            session.dialogData.person.alter = results.response.entity;
            if (session.dialogData.person.alter == getT(session, "$.Person.JugendlicherAlter.12_18Jahre")) {
                session.dialogData.person.realType = "Jugendlicher";
                session.beginDialog("/Ski/PisteJugendlicher", session.dialogData.person);
            } else if (session.dialogData.person.alter == getT(session, "$.Person.JugendlicherAlter.Ueber18Jahre")) {
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


bot.dialog('/Ski/KinderAlter', [
    function (session, args, next) {
        var nThPersonText = getTT(session, args.typeWithArtikel, args.index+1);
        choices(session, "$.Person.KindAlter", "$.Person.KindAlter.Choices", nThPersonText);
    }
  ]).cancelAction('/Intro', "$.Ski.Abbruch", { matches: /(intro|help|start)/i });
  
  bot.dialog('/Ski/JugendlicherAlter', [
    function (session, args, next) {
        var nThPersonText = getTT(session, args.typeWithArtikel, args.index+1);
        choices(session, "$.Person.JugendlicherAlter", "$.Person.JugendlicherAlter.Choices", nThPersonText);
    }
  ]).cancelAction('/Intro', "$.Ski.Abbruch", { matches: /(intro|help|start)/i });

bot.dialog('/Ski/PisteErwachsener', [
  function (session, args, next) {
    var nThPersonText = getTT(session, args.typeWithArtikel, args.index+1);
    choices(session, "$.Person.Piste", "$.Person.Piste.Choices", nThPersonText);
  }
]).cancelAction('/Intro', "$.Ski.Abbruch", { matches: /(intro|help|start)/i });

bot.dialog('/Ski/PisteKind', [
  function (session, args, next) {
    var nThPersonText = getTT(session, args.typeWithArtikel, args.index+1);
    choices(session, "$.Person.Piste", "$.Person.Piste.Kinder.Choices", nThPersonText);
  }
]).cancelAction('/Intro', "$.Ski.Abbruch", { matches: /(intro|help|start)/i });

bot.dialog('/Ski/SchuheKind', [
    function (session, args, next) {
        var nThPersonText = getTT(session, args.typeWithArtikel, args.index+1);
        choices(session, "$.Person.KindSchuh", "$.Person.KindSchuh.Choices", nThPersonText);
    }
  ]).cancelAction('/Intro', "$.Ski.Abbruch", { matches: /(intro|help|start)/i });
    

bot.dialog('/Ski/PisteJugendlicher', [
    function (session, args, next) {
        var nThPersonText = getTT(session, args.typeWithArtikel, args.index+1);
        choices(session, "$.Person.Piste", "$.Person.Piste.Jugendlicher.Choices", nThPersonText);
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
          minNumber = parseInt(numberEntity.entity);
        } 
      }
    }
  }
  return minNumber; 
}

bot.dialog('/Ski/PersonenAuswahl', [
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
          session.replaceDialog('/Ski/PersonenAuswahl')          
        }
      } else {
        session.send("$.Ski.BestätigungPersonenFehler");
        session.replaceDialog('/Ski/PersonenAuswahl')
      }
    });
  }
]);

var rp = require("request-promise");
var LRUCache = require('lrucache');
var svgResultCache = LRUCache(20);
var hash = require('object-hash');


//http://localhost:3978/model/skis/set/kind/blau
function getMinPrices(typ, alter, piste) {
    if (!piste) {
        piste = "*"
    }
    var dataGETurl = process.env.ESKO_ENDPOINT_URL+"/model/skis/"+typ.toLowerCase()+"/"+alter.toLowerCase()+"/"+piste.toLowerCase();
    return rp(dataGETurl);
}
//http://localhost:3978/model/skis/set/kind/blau/29-34
function getMinPrices(typ, alter, piste, kategorie) {
    if (!kategorie) {
        kategorie = "*"
    }
    if (!piste) {
        piste = "*"
    }
    var dataGETurl = process.env.ESKO_ENDPOINT_URL+"/model/skis/"+typ.toLowerCase()+"/"+alter.toLowerCase()+"/"+piste.toLowerCase()+"/"+kategorie.toLowerCase();
    return rp(dataGETurl);
}

/* data contains
    [
                {"type":"Kind","piste":"Aktion"},
                {"type":"Erwachsener","piste":"schwarz"},
    ]
*/
const svg2png = require("svg2png");

function saveObjectToDB(db, collectionName, object, callback_Error_UUID) {
    var collection = db.get(collectionName);
    collection.insert(object, function(e, insertedItem) {
        callback_Error_UUID(e, insertedItem._id.toString());
    });
}
function getObjectFromDB(db, collectionName, uuid, callback_UUID) {
    var collection = db.get(collectionName);
    collection.findOne({ _id : uuid }, function(e,docs){
        if (isError(e, docs, 'No '+collectionName+' found with _id '+uuid)) {
            callback_UUID(undefined);
            return;
        }
        callback_UUID(docs);
        return;
    });
}

function isTestUserId(currentUserId) {
    var testusers = process.env.TEST_USER_IDS.split(",");
    for (var userId in testusers) {
        if (testusers.hasOwnProperty(userId)) {
            var userId = testusers[userId];
            if (userId.trim() == currentUserId) {
                return true
            }
        }
    }
    return false;
}

function setSVGRentalResult(user, data, cb) {
    var buffer = {text: ""};
    svg_start(buffer);
    svg_table_start(buffer, {x:20, y:'2em'}, 16, [70, 70, 70, 70, 70, 70]);
    svg_box(buffer, 0, 0, buffer.table.totalWidth, buffer.table.totalWidth / 2);
    svg_table_row(buffer, ["Wer", "Piste", "Ski", "Schuhe", "Stock", "Set"], true);
    var dataPromise = [];
    for (var i = 0; i < data.length; ++i) {
        dataPromise.push(getMinPrices("ski", data[i].type, data[i].piste));
        dataPromise.push(getMinPrices("schuhe", data[i].type, data[i].pisteSchuhe, data[i].schuhe));
        dataPromise.push(getMinPrices("stock", data[i].type));
        dataPromise.push(getMinPrices("set", data[i].type, data[i].piste));
    }
    Promise.all(dataPromise).then(values => {
        var t = 0;
        var summeSki = summeSchuhe = summeStock = summeSet = 0;
        var summeSkiAb = summeSchuheAb = summeStockAb = summeSetAb = false;
        var empty = {tage_100: 0, tage_100_ab: false};
        for (var i = 0; i < values.length; ++i) {
            var ski=JSON.parse(values[i++]).data[0] || empty;
            var schuhe=JSON.parse(values[i++]).data[0] || empty;
            var stock=JSON.parse(values[i++]).data[0] || empty;
            var set=JSON.parse(values[i]).data[0] || empty;
            var schuheText = "";
            if (data[t].schuhe) {
                schuheText = " ("+data[t].schuhe+")";
            }
            svg_table_row(buffer, [
                (t+1)+":"+data[t].type.substr(0, 1), 
                data[t].piste, 
                (ski.tage_100_ab ? "ab ":"")+ski.tage_100+".-", 
                (schuhe.tage_100_ab ? "ab ":"")+schuhe.tage_100+".-",
                (stock.tage_100_ab ? "ab ":"")+stock.tage_100+".-",
                (set.tage_100_ab ? "ab ":"")+set.tage_100+".-"
            ], false);
            data[t].preise = {
                ski: ski.tage_100,
                schuhe: schuhe.tage_100,
                stock: stock.tage_100,
                set: set.tage_100
            }

            summeSki += ski.tage_100;
            summeSkiAb |= ski.tage_100_ab;
            
            summeSchuhe += schuhe.tage_100;
            summeSchuheAb |= schuhe.tage_100_ab;

            summeStock += stock.tage_100;
            summeStockAb |= stock.tage_100_ab;

            summeSet += set.tage_100;
            summeSetAb |= set.tage_100_ab;
            t++;
        }

        var preise = {
            ski: summeSki,
            schuhe: summeSchuhe,
            stock: summeStock,
            set: summeSet
        }

        svg_table_row(buffer, ["", "", "", "", "", ""], false);
        svg_table_row(buffer, ["Total", 
            "", 
            (summeSkiAb ? "ab ":"")+summeSki+".-", 
            (summeSchuheAb ? "ab ":"")+summeSchuhe+".-", 
            (summeStockAb ? "ab ":"")+summeStock+".-", 
            (summeSetAb ? "ab ":"")+summeSet+".-"
        ], false);
        var first = true;
        for (var t = 0; t < data.length; t++) {
            if (data[t].schuhe) {
                if (first) {
                    svg_table_row(buffer, ["", "", "", "", "", ""], false);                    
                    svg_table_row(buffer, ["Zusatzinformationen:", "", "", "", "", ""], false);                    
                    first = false;
                }
                var schuheText = (t+1)+".Kind Schuhe "+data[t].schuhe;
                svg_table_row(buffer, [schuheText, "", "", ""], false);
            }
        }
    
        svg_table_end(buffer);
        svg_end(buffer);
        var isTestUser = isTestUserId(user.id);
        var pngBuffer = svg2png.sync(new Buffer(buffer.text), { width: buffer.table.totalWidth, height: buffer.table.totalWidth /2 });
        var angebot = { date: new Date(), test: isTestUser, user: user, data: data, preise: preise, svg: buffer.text, width: buffer.table.totalWidth, pngBase64Encoded: pngBuffer.toString('base64') };
        saveObjectToDB(db, "angebote", angebot, function(error, uuid) {
            svgResultCache.set(uuid, angebot);
            var pngUrl = process.env.ESKO_ENDPOINT_URL+"/miete.png?uuid="+uuid;
            console.log("cache size svgResultCache: "+svgResultCache.info().length+" of "+svgResultCache.info().capacity);
            sendBotMail(
                "Esko Bot - Angebot abgegeben - " + angebot.user.name + (angebot.test ? " - Test" : ""), 
                getBotRequestBodyText(angebot, pngUrl),
                (angebot.test ? process.env.SMTP_TO_USER_TEST : process.env.SMTP_TO_USER)
            );
            cb(uuid, buffer.text);
        });
    });
}

function getBotRequestBodyText(angebot, url) {
    var contents = fs.readFileSync('./locale/de/email-template.html', 'utf8');
    // data.preise = {
    //     ski, schuhe, stock, set
    //}
    var preise = angebot.preise;
    contents = contents.replace("$data.ski", preise.ski);
    contents = contents.replace("$data.schuhe", preise.schuhe);
    contents = contents.replace("$data.stock", preise.stock);
    contents = contents.replace("$data.set", preise.set);
    contents = contents.replace("$data.png", url);
    contents = contents.replace("$user.id", angebot.user.id);
    contents = contents.replace("$user.name", angebot.user.name);
    contents = contents.replace("$date", angebot.date.toString());
    contents = contents.replace("$data.count", angebot.data.length);
    
    return contents;
}


function getCachedObject(collectionName, uuid, callback_Object) {
    var object = svgResultCache.get(uuid);
    if (uuid && !object) {
        getObjectFromDB(db, collectionName, uuid, callback_Object);
    } else {
        callback_Object(object);        
    }
}


//based http://svg-whiz.com/svg/table.svg
// [
//    {"type":"Kind","piste":"rot"},
//    {"type":"Erwachsener","piste":"blau"}
//  ]
//
server.get('/miete.svg', function(req, res, next) {
    var uuid = req.param("uuid");
    getCachedObject("angebote", uuid, function (object) {
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
    getCachedObject("angebote", uuid, function(object) {
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
