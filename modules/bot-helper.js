var sprintf = require('sprintf-js');
var fs = require('fs');

module.exports = BotHelper;

function BotHelper (bot, builder, recognizer) {
  return new Bot(bot, builder, recognizer);
};

function Bot(bot, builder, recognizer) {
  this.bot = bot;
  this.builder = builder;
  this.recognizer = recognizer;
  this.localTexts = JSON.parse(fs.readFileSync("./locale/de/index.json", "utf8"));

  this.replRegExp = function replRegExp(session, text) {
      var reg=/(\$\.[a-zA-Z\.]+)/ig;
      var variableReplacementArray = text.match(reg);
      if (variableReplacementArray) {
          for (var i=0; i < variableReplacementArray.length;i++) {
              var fromVar = variableReplacementArray[i];
              var toText = this.getT(session, fromVar);
              text = text.replace(fromVar, toText);
          }
      }
      return text;
  }
  this.getT = function getT(session, text) {
      if (session) {
          return session.localizer.gettext(session.preferredLocale(), text)
      } else {
          return this.localTexts[text];
      }
  }
  this.getTT = function getTT(session, text, ...args) {
      return sprintf.sprintf(this.getT(session, text), args)
  }
  this.locale = function locale(session, text, ...args) {
      var intro = this.getTT(session, text, args);
      return this.replRegExp(session, intro);      
  }
  // pass a text in locale file and will be replaced according to the language
  this.choices = function choices(session, text, choices, ...args) {
      var intro = this.locale(session, text, args);
      var options = this.locale(session, choices, args);
      this.builder.Prompts.choice(session, intro, options, {listStyle: builder.ListStyle["button"]});
  }
}