var rp = require("request-promise");
module.exports = PriceHelper;

function PriceHelper () {
  return new Price();
};

function Price() {
    

    //http://localhost:3978/model/skis/set/kind/blau
    this.getMinPrices = function getMinPrices(typ, alter, piste) {
        if (!piste) {
            piste = "*"
        }
        var dataGETurl = process.env.ESKO_ENDPOINT_URL+"/model/skis/"+typ.toLowerCase()+"/"+alter.toLowerCase()+"/"+piste.toLowerCase();
        var options = {
            headers: {
                APP_KEY    : process.env.APP_KEY,
                APP_SECRET : process.env.APP_SECRET,
            }
        };
        return rp(dataGETurl, options);
    }
    //http://localhost:3978/model/skis/set/kind/blau/29-34
    this.getMinPrices = function getMinPrices(typ, alter, piste, kategorie) {
        if (!kategorie) {
            kategorie = "*"
        }
        if (!piste) {
            piste = "*"
        }
        var dataGETurl = process.env.ESKO_ENDPOINT_URL+"/model/skis/"+typ.toLowerCase()+"/"+alter.toLowerCase()+"/"+piste.toLowerCase()+"/"+kategorie.toLowerCase();
        var options = {
            headers: {
                APP_KEY    : process.env.APP_KEY,
                APP_SECRET : process.env.APP_SECRET,
            }
        };
        return rp(dataGETurl, options);
    }

    /* data contains
        [
                    {"type":"Kind","piste":"Aktion"},
                    {"type":"Erwachsener","piste":"schwarz"},
        ]
    */


    this.isTestUserId = function isTestUserId(currentUserId) {
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

    this.getRentalResult = function getRentalResult(user, data, cb) {
        var angebot = {
            date: new Date(), 
            test: this.isTestUserId(user.id), 
            user: user, 
            data: data, 
            preise: {
                ski: { value: 0, startingAt: false },
                schuhe: { value: 0, startingAt: false },
                stock: { value: 0, startingAt: false },
                set: { value: 0, startingAt: false }
            },
            svg: undefined,
            width: 0,
            pngBase64Encoded: undefined,
            additionalInfo: []
        };
        var dataPromise = [];
        for (var i = 0; i < data.length; ++i) {
            dataPromise.push(this.getMinPrices("ski", data[i].type, data[i].piste));
            dataPromise.push(this.getMinPrices("schuhe", data[i].type, data[i].pisteSchuhe, data[i].schuhe));
            dataPromise.push(this.getMinPrices("stock", data[i].type));
            dataPromise.push(this.getMinPrices("set", data[i].type, data[i].piste, data[i].schuhe));
        }
        Promise.all(dataPromise).then(values => {
            var t = 0;
            var empty = {tage_100: 0, tage_100_ab: false};
            for (var i = 0; i < values.length; ++i) {
                var ski=JSON.parse(values[i++]).data[0] || empty;
                var schuhe=JSON.parse(values[i++]).data[0] || empty;
                var stock=JSON.parse(values[i++]).data[0] || empty;
                var set=JSON.parse(values[i]).data[0] || empty;

                data[t].shortType = data[t].type.substr(0, 1);
                data[t].no = t+1;
                data[t].preise = {
                    ski:    { value: ski.tage_100,      startingAt: ski.tage_100_ab },
                    schuhe: { value: schuhe.tage_100,   startingAt: schuhe.tage_100_ab },
                    stock:  { value: stock.tage_100,    startingAt: stock.tage_100_ab },
                    set:    { value: set.tage_100,      startingAt: set.tage_100_ab }
                }
                angebot.preise.ski.value += ski.tage_100;
                angebot.preise.ski.startingAt |= ski.tage_100_ab;

                angebot.preise.schuhe.value += schuhe.tage_100;
                angebot.preise.schuhe.startingAt |= schuhe.tage_100_ab;

                angebot.preise.stock.value += stock.tage_100;
                angebot.preise.stock.startingAt |= stock.tage_100_ab;

                angebot.preise.set.value += set.tage_100;
                angebot.preise.set.startingAt |= set.tage_100_ab;
                t++;
            }
            angebot.additionalInfo.push("Ihr Skimiete Angebot");
            angebot.additionalInfo.push("Jahresmiete 10% Rabatt bis So 5. Nov 2017");
            for (var t = 0; t < data.length; t++) {
                if (data[t].schuhe) {
                    var schuheText = (t+1)+".Kind Schuhe "+data[t].schuhe;
                    angebot.additionalInfo.push(schuheText);
                }
            }
            cb(angebot)        
        }); // end promise
    }

    this.getPreisText = function getPreisText(preise) {
        return (preise.startingAt ? "ab ":"")+preise.value+".-"
    }


    
}