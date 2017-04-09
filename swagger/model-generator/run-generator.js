var g = require("./generator");

var s = require("./sample-skis");
g.generator().swagger("Skis", "Ski", s.sample_skis().object());
