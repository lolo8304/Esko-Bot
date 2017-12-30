var numeral = require('numeral');
const svg2png = require("svg2png");
var LRUCache = require('lrucache');
var hash = require('object-hash');
var fs = require('fs');

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

function getPreisText(preise) {
    return (preise.startingAt ? "ab ":"")+preise.value+".-"
}

module.exports = SVGHelper;

function SVGHelper (db, email, price) {
    return new SVG(db, email, price);
};

function SVG(db, email, price) {
    this.svgResultCache = LRUCache(20);    
    this.db = db;
    this.email = email;
    this.price = price;
    var self = this;

    this.px2em = function px2em(refPX, px) {
        return numeral(px / refPX).format('0.00')+"em";
    }
    this.em2px = function em2px(refPX, em) {
        var emNum = numeral(em.substr(0, em.indexOf("em"))).value();
        return numeral(numeral(emNum * refPX).format('0.0')).value();
    }
    
    this.svg_start = function svg_start(buffer) {
        this.svg_content(buffer, "<svg xmlns=\'http://www.w3.org/2000/svg\' xmlns:xlink=\'http://www.w3.org/1999/xlink\'>");
    }
    this.svg_content = function svg_content(buffer, text) {
        buffer.text = buffer.text + text;
    }
    this.svg_end = function svg_end(buffer) {
        this.svg_content(buffer, "</svg>");
    }
    this.svg_table_row_internal = function svg_table_row_internal(buffer, data, isFontWeightBold) {
        var bold = isFontWeightBold ? "font-weight='bold' fill='crimson'" : "";
        this.svg_content(buffer, "<text x='"+buffer.table.startXY.x+"' y='"+buffer.table.startXY.y+"' text-anchor='middle' "+bold+">\n");
        var posX = buffer.table.startXY.x;
        var dyString = "dy='"+buffer.table.currentHeightEm+"em' font-weight='bold' fill='crimson' text-anchor='start'";
        for (var i = 0; i < data.length; ++i) {
            this.svg_content(buffer, "<tspan x='"+posX+"' "+dyString+">"+data[i]+"</tspan>\n");
            posX = posX + buffer.table.widthArray[i];
            dyString = "";
        }
        this.svg_content(buffer, "</text>");    
    }
    
    this.svg_table_start = function svg_table_start(buffer, startXY, fontSize, widthArray) {
        buffer.table = {
            startXY: startXY,
            fontSize: fontSize,
            widthArray: widthArray,
            totalWidth: 0,
            highlightRow: 1,
            currentHeightEm: 0
        };
        buffer.table.totalWidth = widthArray.reduce((sum, value) => sum + value, 0);
        this.svg_content(buffer, "<g font-size='"+buffer.table.fontSize+"px'>\n");
    }
    this.svg_table_row = function svg_table_row(buffer, data, isStrong) {
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
            this.svg_content(buffer, "<rect x='"+(buffer.table.startXY.x-5)+"' y='"+(buffer.table.currentHeightEm+0.2)+"em' width='"+(buffer.table.totalWidth+10)+"' height='1em' fill='gainsboro' style='fill-opacity: "+opacity+"'/>\n");
        }
        this.svg_table_row_internal(buffer, data, isStrong);
    }
    
    this.svg_box = function svg_box(buffer, x, y, w, h) {
        this.svg_content(buffer, "<rect fill='#FFFFFF' x='"+x+"' y='"+y+"' width='"+w+"px' height='"+h+"px'/>\n");
    }
    this.svg_table_end = function svg_table_end(buffer) {
        this.svg_content(buffer, "</g>");
    }
    
    this.getCachedObject = function getCachedObject(collectionName, uuid, callback_Object) {
        var object = this.svgResultCache.get(uuid);
        if (uuid && !object) {
            this.getObjectFromDB(collectionName, uuid, callback_Object);
        } else {
            callback_Object(object);        
        }
    }
    this.setCachedObject = function setCachedObject(collectionName, uuid, angebot) {
        this.svgResultCache.set(uuid, angebot);
        console.log("cache size svgResultCache: "+this.svgResultCache.info().length+" of "+this.svgResultCache.info().capacity);
    }
    
        

    this.setSVGRentalResult = function setSVGRentalResult(user, data, cb) {
        var buffer = {text: ""};
        self.svg_start(buffer);
        self.svg_table_start(buffer, {x:20, y:'2em'}, 16, [70, 70, 70, 70, 70, 70]);
        self.svg_box(buffer, 0, 0, buffer.table.totalWidth, buffer.table.totalWidth / 2);
        self.svg_table_row(buffer, ["Wer", "Piste", "Ski", "Schuhe", "Stock", "Set"], true);
        self.price.getRentalResult(user, data, function (angebot) {
            for (var index = 0; index < angebot.data.length; index++) {
                var element = angebot.data[index];
                self.svg_table_row(buffer, [
                    element.no+":"+element.shortType, 
                    element.piste, 
                    getPreisText(element.preise.ski), 
                    getPreisText(element.preise.schuhe), 
                    getPreisText(element.preise.stock), 
                    getPreisText(element.preise.set)
                ], false);
            }
    
            if (angebot.data.length > 1) {
                self.svg_table_row(buffer, ["", "", "", "", "", ""], false);
                self.svg_table_row(buffer, ["Total", 
                    "", 
                    getPreisText(angebot.preise.ski),
                    getPreisText(angebot.preise.schuhe),
                    getPreisText(angebot.preise.stock),
                    getPreisText(angebot.preise.set)
                ], false);
            }
            self.svg_table_row(buffer, ["", "", "", "", "", ""], false);  
            angebot.additionalInfo.forEach(function(text) {
                self.svg_table_row(buffer, [text, "", "", "", "", ""], false);                    
            }, this);
            self.svg_table_end(buffer);
            self.svg_end(buffer);
            angebot.svg = buffer.text;
            angebot.width = buffer.table.totalWidth;
            var pngBuffer = svg2png.sync(new Buffer(buffer.text), { width: buffer.table.totalWidth, height: buffer.table.totalWidth /2 });
            angebot.pngBase64Encoded = pngBuffer.toString('base64');
            self.saveObjectToDB("angebote", angebot, function(error, uuid) {
                var pngUrl = process.env.ESKO_ENDPOINT_URL+"/miete.png?uuid="+uuid;
                self.email.sendBotMail(
                    "Esko Bot - Angebot abgegeben - " + angebot.user.name + (angebot.test ? " - Test" : ""), 
                    self.getBotRequestBodyText(angebot, pngUrl),
                    (angebot.test ? process.env.SMTP_TO_USER_TEST : process.env.SMTP_TO_USER)
                );
                cb(uuid, data, buffer.text);
            }); // end save object callback
        }); // end getResult callback
    }
    
    this.getBotRequestBodyText = function getBotRequestBodyText(angebot, url) {
        var contents = fs.readFileSync('./locale/de/email-template.html', 'utf8');
        // data.preise = {
        //     ski, schuhe, stock, set
        //}
        var preise = angebot.preise;
        contents = contents.replace("$data.ski", getPreisText(preise.ski));
        contents = contents.replace("$data.schuhe", getPreisText(preise.schuhe));
        contents = contents.replace("$data.stock", getPreisText(preise.stock));
        contents = contents.replace("$data.set", getPreisText(preise.set));
        contents = contents.replace("$data.png", url);
        contents = contents.replace("$user.id", angebot.user.id);
        contents = contents.replace("$user.name", angebot.user.name);
        contents = contents.replace("$date", angebot.date.toString());
        contents = contents.replace("$data.count", angebot.data.length);
        
        return contents;
    }
    
    this.saveObjectToDB = function saveObjectToDB(collectionName, object, callback_Error_UUID) {
        var collection = this.db.get(collectionName);
        collection.insert(object, function(e, insertedItem) {
            if (insertedItem) {
                var uuid = insertedItem._id.toString();
                self.setCachedObject(collectionName, uuid, insertedItem);                
                callback_Error_UUID(e, uuid);
            } else {
                callback_Error_UUID(e, undefined);
            }
                
        });
    }
    this.getObjectFromDB = function getObjectFromDB(collectionName, uuid, callback_UUID) {
        var collection = this.db.get(collectionName);
        collection.findOne({ _id : uuid }, function(e,docs){
            if (isError(e, docs, 'No '+collectionName+' found with _id '+uuid)) {
                callback_UUID(undefined);
                return;
            }
            callback_UUID(docs);
            return;
        });
    }


}