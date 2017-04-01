/*-----------------------------------------------------------------------------
A simple echo bot for the Microsoft Bot Framework. 
-----------------------------------------------------------------------------*/

var builder = require('./core/');
var restify = require('restify');
var request = require('request');
require('dotenv').config();
var _ = require('lodash');
var moment = require('moment');


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
                  var reply = new builder.Message()
                          .address(message.address)
                          .text("Hallo %s. Mein Name ist **Esko** vom **Sports-Village.ch** und freue mich Euch helfen zu können!\nMit **'start'** kannst Du immer wieder von vorne beginnen.", name);
                  bot.send(reply);
              }
          });
      }

      // Send a goodbye message when bot is removed
      if (message.membersRemoved) {
          message.membersRemoved.forEach(function (identity) {
              if (identity.id === message.address.bot.id) {
                  var reply = new builder.Message()
                      .address(message.address)
                      .text("Tschüss - auf einer ander Mal. Dein Esko vom Sports-Village.ch");
                  bot.send(reply);
              }
          });
      }
});

bot.on('contactRelationUpdate', function (message) {
    if (message.action === 'add') {
        var name = message.user ? message.user.name : null;
        var reply = new builder.Message()
                .address(message.address)
                .text("Hallo %s... Mein Name ist Esko vom Sports-Village.ch und freue mich Dir helfen zu können. Mit 'start' kannst Du immer wieder von vorne beginnen.", name || 'there');
        bot.send(reply);
    } else {
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
var dialog = new builder.IntentDialog({ recognizers: [recognizer] });
bot.dialog('/', dialog);


//=========================================================
// Dialogs
//=========================================================


dialog.onDefault(
 builder.DialogAction.send("$.Intro.Fehler")
);


dialog.matches('intro', [
  function (session, args, next) {
        session.preferredLocale("de");
        var card = new builder.HeroCard(session)
            .title("Esko-Bot")
            .text("... vom Sports-Village.ch.")
            .images([
                 builder.CardImage.create(session, "https://bot-framework.azureedge.net/bot-icons-v1/Esko-Bot_AQV1EDC7d8QL9EC2WgFA64iy9uHF43619FMLCvC4vtE0uOo.png")
            ]);
        var msg = new builder.Message(session).attachments([card]);
        session.send(msg);
        session.send("$.Intro.Willkommen");
        var options = session.localizer.gettext(session.preferredLocale(), "$.Intro.Auswahl.Optionen");
        builder.Prompts.choice(session, "$.Intro.Auswahl", options)
  },
  function (session, results) {
  }

]);

dialog.matches('risk', [
  function (session, args, next) {
    const countries = _.map(builder.EntityRecognizer.findAllEntities(args.entities || [], ENTITIES.COUNTRY) || [], 'entity');
    const customer = (builder.EntityRecognizer.findEntity(args.entities || [], ENTITIES.CUSTOMER) || {}).entity;
    const businessLine = (builder.EntityRecognizer.findEntity(args.entities || [], ENTITIES.BUSINESS_LINE) || {}).entity;
    if (allowedBL.indexOf(businessLine) === -1) {
      session.endDialog('Sorry at this moment I can only help you with Property policies');
    } else if (countries.length && customer && businessLine) {
      var startDate = moment(new Date().getTime()).format('LL');
      var endDate = moment(new Date().setFullYear(new Date().getFullYear() + 1)).format('LL');
      session.dialogData.program = {
        customer: {
          name: customer
        },
        businessLine: businessLine,
        startDate: startDate,
        endDate: endDate
      };
      var countryObjects = [];
      countries.forEach(function(country) {
        var countryObject = {
          name: country,
          solution: null
        };
        countryObjects.push(countryObject);
      });
      session.dialogData.program.countries = countryObjects;
      session.send("I have created a **"+businessLine+"** program  for **"+customer+"** in countries **"+countries+"**");
      builder.Prompts.text(session,'What is the expected **global premium** starting tomorrow for 1 year');
    }
    /*
    if (!countries.length) {
      // No countries provided
    }
    if (!customer) {
      // No customer
    }
    if (!businessLine) {
      // No businessLine
    }
    */
  },
  function (session, results) {
    // Recognize the premium
    recognizer.recognize({ message: { text: results.response }, locale: 'en' }, (err, args) => {
      const premium = (builder.EntityRecognizer.findEntity(args.entities || [], ENTITIES.NUMBER) || {}).entity;
      if (args.intent === 'premium' && premium) {
        session.dialogData.program.premium = premium;
        session.send("All set. Give me a few seconds to give you the best option");
        session.replaceDialog("ChooseSolution", session.dialogData);
      } else {
        // No premium provided it should repeat this step
        session.endDialog('Sorry at we need a figure for the premium. We have to start again');
      }
    });
  }
]);

function nextCountry(countries) {
  var emptyOnes = countries.filter(function(country) {
    return !country.solution;
  });
  return emptyOnes[0];
}
function nextCountryNamed(countries, name) {
  var emptyOnes = countries.filter(function(country) {
    return country.name == name;
  });
  return emptyOnes[0];
}

bot.dialog('ChooseSolution', [
    function (session, args) {
        // Save previous state (create on first call)
        if (args && args.program) {
          session.dialogData.program = args.program;
        }

        var msg = new builder.Message(session);
        msg.attachmentLayout(builder.AttachmentLayout.carousel)
        var attachments = [];
        var country = nextCountry(session.dialogData.program.countries);
        if (!country) {
          session.replaceDialog('summary', session.dialogData);
          return;
        }
        attachments.push(
          new builder.HeroCard(session)
              .title(country.name)
              .subtitle("Program Premium: "+session.dialogData.program.premium+"€")
              .text("The recommended options are)")
              .images([builder.CardImage.create(session, getFlagURL(country.name))])
              .buttons([
                  builder.CardAction.dialogAction(session, "SetSolution", "choose solution integrated for "+country.name, "integrated"),
                  builder.CardAction.dialogAction(session, "SetSolution", "choose solution coordinated for "+country.name, "coordinated"),
                  builder.CardAction.dialogAction(session, "SetSolution", "choose solution fos for "+country.name, "fos/fee of service")
              ])
        );
        msg.attachments(attachments);
        session.userData.program = session.dialogData.program;
        session.send(msg);
    }
]);



bot.dialog('summary', [
  (session, args) => {
    session.dialogData.program = args.program;
    const program = session.dialogData.program;
    const attachments = [new builder.HeroCard(session).title(`Program created for Customer ${program.customer.name}`).subtitle(`Business Line is ${program.businessLine}`).text(`A program has been created with an estimated global premium of ${program.premium}€ for the period from ${program.startDate} to ${program.endDate}`)];
    program.countries.forEach(country => {
      attachments.push(new builder.HeroCard(session)
        .title(country.name)
        .subtitle(`Selected solution: ${country.solution}`)
        .images([builder.CardImage.create(session, getFlagURL(country.name || 'france'))]));
    });
    attachments.push(new builder.HeroCard(session).title('Are you happy with the proposal').buttons([
      builder.CardAction.openUrl(session, "https://www.axa-im.com/en/thank-you-query", "Yes"),
      builder.CardAction.dialogAction(session, "advise", "I need advise", "I need advise")
    ]));
    const msg = new builder.Message(session)
      .textFormat(builder.TextFormat.xml)
      .attachments(attachments);
    session.send(msg);
  }
]);

// Create a dialog and bind it to a global action
bot.dialog('/advise', [
  function (session, args) {
    session.endDialog("Ok. We have sent all info to the expert working today. Here is his contact data:\n\nSebastian Bohn: +44 238 233 032");
  }
]);
bot.beginDialogAction('advise', '/advise');


bot.dialog('/SetSolution', [
  (session, args) => {
      var response = args.data;
      session.dialogData.program = session.userData.program;
      session.userData.program = null;
      recognizer.recognize({ message: { text: response }, locale: 'en' }, (err, args) => {
        const solution = (builder.EntityRecognizer.findEntity(args.entities || [], ENTITIES.SOLUTION) || {}).entity;
        const countryName = (builder.EntityRecognizer.findEntity(args.entities || [], ENTITIES.COUNTRY) || {}).entity;
        if (args.intent === 'solution' && solution && countryName) {
          var country = nextCountryNamed(session.dialogData.program.countries, countryName);
          if (country) {
            country.solution = solution;
          }
          session.replaceDialog("ChooseSolution", session.dialogData);
        } else {
          // No premium provided it should repeat this step
          session.send('Sorry did not understand your choice for the solution. Try again');
          session.replaceDialog("ChooseSolution", session.dialogData);
        }
      });
  }
]);

bot.beginDialogAction("SetSolution", "/SetSolution");

function getFlagURL(name) {
  switch (name.toLowerCase()) {
    case 'spain':
      return "http://www.geognos.com/api/en/countries/flag/ES.png";
    case 'us':
      return "http://www.geognos.com/api/en/countries/flag/US.png";
    case 'usa':
      return "http://www.geognos.com/api/en/countries/flag/US.png";
    case 'germany':
      return "http://www.geognos.com/api/en/countries/flag/DE.png";
    case 'france':
      return "http://www.geognos.com/api/en/countries/flag/FR.png";
    case 'uk':
      return "http://www.geognos.com/api/en/countries/flag/GB.png";
    case 'switzerland':
      return "http://www.geognos.com/api/en/countries/flag/CH.png";
    default:
      return "http://www.geognos.com/api/en/countries/flag/FR.png";
  }
}
