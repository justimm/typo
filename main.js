/*  ----------------------------------------------------------------------------
 *  typo v0.4.12
 *  
 *  Hide secret information in typographical errors
 *  
 *  Author:  Manish Jethani (manish.jethani@gmail.com)
 *  Date:    April 9, 2015
 *  
 *  See 'typo --help'
 *  
 *  PGP: 57F8 9653 7461 1F9C EEF9 578B FBDC 955C E6B7 4303
 *  
 *  Bitcoin: 1NxChtv1R6q6STF9rq1BZsZ4jUKDh5MsQg
 *  
 *  http://manishjethani.com/
 *  
 *  Copyright (c) 2015 Manish Jethani
 *  
 *  Permission to use, copy, modify, and/or distribute this software for any
 *  purpose with or without fee is hereby granted, provided that the above
 *  copyright notice and this permission notice appear in all copies.
 *  
 *  THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 *  WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 *  MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
 *  SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 *  WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 *  ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR
 *  IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *  ------------------------------------------------------------------------- */

var crypto   = require('crypto');
var fs       = require('fs');
var os       = require('os');
var path     = require('path');
var readline = require('readline');
var stream   = require('stream');

var _name    = 'typo';
var _version = '0.4.12';

var QWERTY  = !'<%= package %>' && '<%= keyboard %>';

var WORDS   = !'<%= package %>' && '<%= dictionary %>'.split('\n');

var HELP_TEXT     = !'<%= package %>' && '<%= help %>';
var LICENSE_TEXT  = !'<%= package %>' && '<%= license %>';

var dictionary = {};

var rules = {};
var rulesetOrder = [];

var wordCharacter = /[A-Za-z'-]/;

var wordPattern = /^'?[A-Za-z]+-?[A-Za-z]+'?[A-Za-z]'?$/;

var say = function () {};

var colors = {
  'black':    { open: 30, close: 39 },
  'red':      { open: 31, close: 39 },
  'green':    { open: 32, close: 39 },
  'yellow':   { open: 33, close: 39 },
  'blue':     { open: 34, close: 39 },
  'magenta':  { open: 35, close: 39 },
  'cyan':     { open: 36, close: 39 },
  'white':    { open: 37, close: 39 },
  'gray':     { open: 90, close: 39 },
  'grey':     { open: 90, close: 39 },
};

var backgroundColors = {
  'black':    { open: 40, close: 49 },
  'red':      { open: 41, close: 49 },
  'green':    { open: 42, close: 49 },
  'yellow':   { open: 43, close: 49 },
  'blue':     { open: 44, close: 49 },
  'magenta':  { open: 45, close: 49 },
  'cyan':     { open: 46, close: 49 },
  'white':    { open: 47, close: 49 },
};

var textStyles = {
  'bold':           { open:  1, close: 22 },
  'dim':            { open:  2, close: 22 },
  'italic':         { open:  3, close: 23 },
  'underline':      { open:  4, close: 24 },
  'inverse':        { open:  7, close: 27 },
  'hidden':         { open:  8, close: 28 },
  'strikethrough':  { open:  9, close: 29 },
};

function sayImpl(prefix) {
  if (!prefix) {
    return console.error;
  } else if (typeof prefix === 'function') {
    return function () {
      console.error.apply(console, [ prefix() ].concat(
            sliceArguments(arguments)));
    };
  } else {
    return function () {
      console.error.apply(console, [ prefix ].concat(
            sliceArguments(arguments)));
    };
  }
}

function sliceArguments(begin, end) {
  return Array.prototype.slice.call(sliceArguments.caller.arguments,
      begin, end);
}

function async(func) {
  var args = sliceArguments(1);
  process.nextTick(function () {
    func.apply(null, args);
  });
}

function chain(list, errorCallback, doneCallback) {
  // This function lets you chain function calls so the output of one is the
  // the input to the next. If any of them throws an error, it goes to the
  // error callback. Once the list has been exhausted, the final result goes to
  // the done callback.

  var params = sliceArguments(3);

  var func = list.shift();

  if (func) {
    params.push(function (error) {
      if (error) {
        errorCallback(error);
      } else {
        chain.apply(null, [ list, errorCallback, doneCallback ]
              .concat(sliceArguments(1)));
      }
    });
  } else {
    func = doneCallback;
  }

  async(function () {
    try {
      func.apply(null, params);
    } catch (error) {
      errorCallback(error);
    }
  });
}

function die() {
  if (arguments.length > 0) {
    console.error.apply(console, arguments);
  }

  process.exit(1);
}

function dieOnExit() {
  process.exitCode = 1;
}

function logError(error) {
  if (error) {
    console.error(error.toString());
  }
}

function parseArgs(args) {
  // This is another cool function. It parses command line arguments of two
  // kinds: '--long-name[=<value>]' and '-n [<value>]'
  // 
  // If the value is omitted, it's assumed to be a boolean true.
  // 
  // You can pass in default values and a mapping of short names to long names
  // as the first and second arguments respectively.

  var rest = sliceArguments(1);

  var defaultOptions  = typeof rest[0] === 'object' && rest.shift() || {};
  var shortcuts       = typeof rest[0] === 'object' && rest.shift() || {};

  var expect = null;
  var stop = false;

  var obj = Object.create(defaultOptions);

  obj = Object.defineProperty(obj, '...', { value: [] });
  obj = Object.defineProperty(obj, '!?',  { value: [] });

  // Preprocessing.
  args = args.reduce(function (newArgs, arg) {
    if (!stop) {
      if (arg === '--') {
        stop = true;

      // Split '-xyz' into '-x', '-y', '-z'.
      } else if (arg.length > 2 && arg[0] === '-' && arg[1] !== '-') {
        arg = arg.slice(1).split('').map(function (v) { return '-' + v });
      }
    }

    return newArgs.concat(arg);
  },
  []);

  stop = false;

  return args.reduce(function (obj, arg, index) {
    var single = !stop && arg[0] === '-' && arg[1] !== '-';

    if (!(single && !(arg = shortcuts[arg]))) {
      if (!stop && arg.slice(0, 2) === '--') {
        if (arg.length > 2) {
          var eq = arg.indexOf('=');

          if (eq === -1) {
            eq = arg.length;
          }

          var name = arg.slice(2, eq);

          if (!single && !defaultOptions.hasOwnProperty(name)) {
            obj['!?'].push(arg.slice(0, eq));

            return obj;
          }

          if (single && eq === arg.length - 1) {
            obj[expect = name] = '';

            return obj;
          }

          obj[name] = typeof defaultOptions[name] === 'boolean'
              && eq === arg.length
              || arg.slice(eq + 1);

        } else {
          stop = true;
        }
      } else if (expect) {
        obj[expect] = arg;

      } else if (rest.length > 0) {
        obj[rest.shift()] = arg;

      } else {
        obj['...'].push(arg);
      }

    } else if (single) {
      obj['!?'].push(args[index]);
    }

    expect = null;

    return obj;
  },
  obj);
}

function prettyBuffer(buffer) {
  return (buffer.toString('hex').toUpperCase().match(/.{2}/g) || []).join(' ');
}

function hash(message, algorithm) {
  return crypto.Hash(algorithm || 'sha256').update(message).digest();
}

function stringDistance(s, t) {
  var a = new Array(t.length + 1);
  for (var x = 0; x < a.length; x++) {
    a[x] = x;
  }

  for (var j = 1; j <= s.length; j++) {
    var p = a[0]++;
    for (var k = 1; k <= t.length; k++) {
      var o = a[k];
      if (s[j - 1] === t[k - 1]) {
        a[k] = p;
      } else {
        a[k] = Math.min(a[k - 1] + 1, a[k] + 1, p + 1);
      }
      p = o;
    }
  }

  return a[t.length];
}

function shuffle(array) {
  for (var m = array.length - 1; m >= 0; m--) {
    var x = 0 | Math.random() * (m + 1);
    if (x !== m) {
      var p = array[x];
      array[x] = array[m];
      array[m] = p;
    }
  }
  return array;
}

function sortBy(array, prop) {
  return array.sort(function (a, b) {
    return -(a[prop] < b[prop]) || +(a[prop] > b[prop]);
  });
}

function findCloseMatches(string, candidateList, distanceThreshold) {
  if (arguments.length < 3) {
    distanceThreshold = 1;
  }

  var matches = candidateList.map(function (candidate) {
    // Split candidate into individual components. e.g. 'output-file' becomes a
    // list containing 'output', 'file', and 'output-file'.
    var candidateWords = candidate.split('-');
    if (candidateWords.length > 1) {
      candidateWords.push(candidate);
    }

    var distance = candidateWords.reduce(function (distance, word) {
      // Take the lowest distance.
      return Math.min(distance, stringDistance(string, word));
    },
    Infinity);

    return {
      candidate: candidate,
      distance:  distance
    };

  }).filter(function (match) {
    return match.distance <= distanceThreshold;
  });

  sortBy(matches, 'distance');

  return matches.map(function (match) { return match.candidate });
}

function typeMatch(one, other, type, exempt) {
  // Check that every property of the given type in one object is also of the
  // same type in the other object.
  return Object.keys(one).every(function (key) {
    return typeof one[key] !== type
        || typeof other[key] === type
        || exempt && exempt.indexOf(key) !== -1;
  });
}

function trigrams(word) {
  // Return three-letter sequences for the word.

  // Example: 'hello' ...

  var seq = [
    // '^he', 'lo$'
    '^' + word.slice(0, 2),
    word.slice(word.length - 2) + '$'
  ];

  // 'hel', 'ell', 'llo'
  for (var i = 0; i < word.length - 2; i++) {
    seq.push(word.slice(i, i + 3));
  }

  return seq;
}

function parseTabularData(data) {
  if (data == null) {
    return null;
  }

  var lines = data.toString().split('\n');
  var records = lines.filter(function (line) {
    return line.match(/^[^#]/);
  });

  return records.map(function (record) {
    return record.split('\t');
  });
}

function stringToBuffer(string, format) {
  var buffer = null;

  switch (format) {
  case 'hex':
    string = '0'.slice(0, string.length % 2) + string;
  case 'base64':
    buffer = new Buffer(string, format);
    break;
  default:
    buffer = new Buffer(string);
  }

  return buffer;
}

function bufferToString(buffer, format) {
  var string = null;

  switch (format) {
  case 'hex':
  case 'base64':
    string = buffer.toString(format);
    break;
  default:
    string = buffer.toString();
  }

  return string;
}

function slurp(callback) {
  var input = '';

  process.stdin.setEncoding('utf8');

  process.stdin.on('readable', function () {
    var chunk = process.stdin.read();
    if (chunk !== null) {
      input += chunk;
    }
  });

  process.stdin.on('end', function () {
    callback(null, input);
  });
}

function slurpFile(filename, callback) {
  fs.readFile(filename, { encoding: 'utf8' }, callback);
}

function slurpFileSync(filename) {
  return fs.readFileSync(filename, { encoding: 'utf8' });
}

function dumpFile(filename, stream, transformer) {
  if (!stream) {
    stream = process.stdout;
  }

  if (transformer) {
    transformer.pipe(stream);
    stream = transformer;
  }

  fs.createReadStream(filename, { encoding: 'utf8' }).pipe(stream);
}

function readInput(filename, callback) {
  if (filename) {
    say('Reading input from file ' + filename);

    slurpFile(filename, callback);

  } else {
    say('Reading input from stdin');

    slurp(callback);
  }
}

function writeOutput(string, filename) {
  if (string != null) {
    if (filename) {
      say('Writing output to file ' + filename);

      fs.writeFileSync(filename, string);

    } else {
      say('Writing output to stdout');

      process.stdout.write(string);
    }
  }
}

function prompt(label, quiet, callback) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('No TTY.');
  }

  if (arguments.length > 0) {
    callback = arguments[arguments.length - 1];
    if (typeof callback !== 'function') {
      callback = null;
    }
  }

  if (typeof quiet !== 'boolean') {
    quiet = false;
  }

  if (typeof label === 'string') {
    process.stdout.write(label);
  }

  var rl = readline.createInterface({
    input: process.stdin,
    // The quiet argument is for things like passwords. It turns off standard
    // output so nothing is displayed.
    output: !quiet && process.stdout || null,
    terminal: true
  });

  rl.on('line', function (line) {
    rl.close();

    if (quiet) {
      process.stdout.write(os.EOL);
    }

    if (callback) {
      callback(null, line);
    }
  });
}

function deriveKey(password, salt, length) {
  return crypto.pbkdf2Sync(password, salt, 0x100000, length, 'sha256');
}

function encrypt(buffer, password, salt, authenticated) {
  var keyLength = 48;
  var algorithm = 'aes-256-ctr';

  if (authenticated) {
    keyLength = 44;
    algorithm = 'aes-256-gcm';
  }

  var key = deriveKey(password, salt, keyLength);
  var cipher = crypto.createCipheriv(algorithm, key.slice(0, 32),
      key.slice(32));

  var encrypted = Buffer.concat([ cipher.update(buffer), cipher.final() ]);

  if (authenticated) {
    // Attach 16-byte authentication tag.
    encrypted = Buffer.concat([ encrypted, cipher.getAuthTag() ]);
  }

  return encrypted;
}

function decrypt(buffer, password, salt, authenticated) {
  var keyLength = 48;
  var algorithm = 'aes-256-ctr';

  if (authenticated) {
    keyLength = 44;
    algorithm = 'aes-256-gcm';
  }

  var key = deriveKey(password, salt, keyLength);
  var decipher = crypto.createDecipheriv(algorithm, key.slice(0, 32),
      key.slice(32));

  if (authenticated) {
    decipher.setAuthTag(buffer.slice(-16));
    buffer = buffer.slice(0, -16);
  }

  return Buffer.concat([ decipher.update(buffer), decipher.final() ]);
}

function wordValue(word) {
  // The value of a word is the lower half of the first octet of its SHA-256
  // digest.
  // 
  // e.g. 'colour' is 6 (hash: 'd6838c35...')
  return hash(word, 'sha256')[0] & 0xF;
}

function isColorName(name) {
  return Object.keys(colors).indexOf(name) !== -1;
}

function isTextStyleName(name) {
  return Object.keys(textStyles).indexOf(name) !== -1;
}

function colorize(text, color, table) {
  if (!table) {
    table = colors;
  }

  var open  = '';
  var close = '';

  var obj = table[color];

  if (obj) {
    open  = obj.open;
    close = obj.close;
  }

  return '\u001b[' + open + 'm' + text + '\u001b[' + close + 'm';
}

function textStylize(text, textStyle) {
  return colorize(text, textStyle, textStyles);
}

function stylize(text, style) {
  var props = style && style.match(/([^\s]+)/g) || [];

  var colorProps = props.filter(isColorName);
  var textStyleProps = props.filter(isTextStyleName);

  // Foreground and background colors respectively.
  text = colorize(text, colorProps[0]);
  text = colorize(text, colorProps[1], backgroundColors);

  // Text styles.
  text = textStyleProps.reduce(textStylize, text);

  return text;
}

function printVersion() {
  console.log(_name + ' v' + _version);
}

function printHelp() {
  if (HELP_TEXT) {
    process.stdout.write(HELP_TEXT);
    process.stdout.write(os.EOL);
    return;
  }

  dumpFile(path.join(__dirname, 'default.help'));
}

function printLicense() {
  if (LICENSE_TEXT) {
    process.stdout.write(LICENSE_TEXT);
    process.stdout.write(os.EOL);
    return;
  }

  dumpFile(path.join(__dirname, 'LICENSE'));
}

function printSource() {
  dumpFile(__filename);
}

function printUsage() {
  var seeHelp = os.EOL + os.EOL + "See '" + _name + " --help'."
              + os.EOL + os.EOL;

  var breakAt = '\n\n';

  if (HELP_TEXT) {
    process.stderr.write(HELP_TEXT.slice(0, HELP_TEXT.indexOf(breakAt)));
    process.stderr.write(seeHelp);
    return;
  }

  var cut = false;

  var x = new stream.Transform({ decodeStrings: false });
  x._transform = function (chunk, encoding, callback) {
    if (!cut) {
      var br = chunk.indexOf(breakAt);
      if (br !== -1) {
        cut = true;
        this.push(chunk.slice(0, br));
      } else {
        this.push(chunk);
      }
      callback();
    }
  };
  x._flush = function (callback) {
    this.push(seeHelp);
    callback();
  };

  dumpFile(path.join(__dirname, 'default.help'), process.stderr, x);
}

function printCloseMatches(string, candidateList) {
  var closeMatches = findCloseMatches(string, candidateList, 2);

  if (closeMatches.length > 1) {
    console.error('Did you mean one of these?');
  } else if (closeMatches.length === 1) {
    console.error('Did you mean this?');
  }

  closeMatches.forEach(function (v) {
    console.error('\t' + v);
  });
}

function loadDictionary(filename) {
  say('Loading dictionary' + (filename ? ' file ' + filename : ''));

  var defaultFilename = path.join(__dirname, 'dictionary');
  var defaultWords = WORDS;

  var words = filename ? slurpFileSync(filename).split('\n')
      : defaultWords  || slurpFileSync(defaultFilename).split('\n');

  words.forEach(function (word) {
    trigrams(word).forEach(function (v) {
      dictionary[v] = dictionary[v] + 1 || 1;
    });
  });
}

function loadKeyboard(filename) {
  say('Loading keyboard ' + (filename ? 'file ' + filename : 'QWERTY'));

  var defaultFilename = path.join(__dirname, 'QWERTY.keyboard');
  var defaultLayout = QWERTY;

  var keyboard = [];

  var layout = filename ? slurpFileSync(filename)
      : defaultLayout  || slurpFileSync(defaultFilename);

  layout.split('\n').forEach(function (row) {
    var keys = row.split('');
    if (keys.length > 0) {
      keyboard.push(keys);
    }
  });

  var ruleset = [];

  var addRule = function (pattern, substitution, weight) {
    ruleset = ruleset.concat(createRule(pattern, substitution, weight));
  };

  for (var i = 0; i < keyboard.length; i++) {
    for (var j = 0; j < keyboard[i].length; j++) {
      var c = (keyboard[i][j] || '').toLowerCase();

      if (c.match(/[a-z]/)) {
        for (var k = j - 1; k <= j + 1; k += 2) {
          var x = (keyboard[i][k] || '').toLowerCase();

          if (x.match(/[a-z]/)) {
            var p = '([^' + c + x + '][^' + c + x + '])' + c
                  + '([^' + c + x + '][^' + c + x + '])';

            // Insertions (aka "fat fingers")
            addRule(p, '$1' + c + x + '$2', 4);
            addRule(p, '$1' + x + c + '$2');

            // Substitutions (wrong key)
            addRule(p, '$1' + x     + '$2');
          }
        }

        // Transpositions
        addRule('([^' + c + '])' + c + '([a-z])(?!\\2)', '$1$2' + c, 4);

        // Shift typos (e.g. "THe")
        addRule('^([A-Z])' + c, '$1' + c.toUpperCase());
      }
    }
  }

  rules['keyboard'] = ruleset;

  rulesetOrder.push('keyboard');
}

function createRule(pattern, substitution, weight) {
  if (arguments.length < 3) {
    return { re: new RegExp(pattern), sub: substitution };
  }

  if (isNaN(weight = +weight)) {
    weight = 1;
  }

  var array = [];
  for (var i = 0; i < weight; i++) {
    array.push(createRule(pattern, substitution));
  }
  return array;
}

function loadRulesetFile(filename, alias) {
  var data = slurpFileSync(filename);
  var records = parseTabularData(data);

  var ruleset = records.reduce(function (ruleset, fields) {
    return ruleset.concat(createRule.apply(null, fields.slice(0, 2)));
  },
  []);

  rules[alias || filename] = ruleset;

  return ruleset;
}

function loadRules(name) {
  if (rules.hasOwnProperty(name)) {
    return rules[name];
  }

  say('Loading ruleset ' + name);

  return loadRulesetFile(path.join(__dirname, name + '.rules'), name);
}

function rulesetAvailable(name) {
  try {
    fs.accessSync(path.join(__dirname, name + '.rules'));
    return true;
  } catch (error) {
    return false;
  }
}

function loadRulesets(spec, filename) {
  if (filename) {
    rulesetOrder = 'custom'.split(' ');

    say('Loading ruleset file ' + filename);

    loadRulesetFile(filename, 'custom');

  } else {
    if (spec != null) {
      rulesetOrder = spec.match(/([^ ,]+)/g) || [];

    } else {
      if (rulesetAvailable('misspelling')) {
        rulesetOrder.push('misspelling');
      }

      if (rulesetAvailable('grammatical')) {
        rulesetOrder.push('grammatical');
      }
    }

    rulesetOrder.forEach(loadRules);
  }
}

function shuffleRules(name) {
  shuffle(rules[name] || []);
}

function mapOptions(options, names, values) {
  names.forEach(function (n) {
    var v = values.shift();
    if (v !== undefined && !options.hasOwnProperty(n)) {
      options[n] = v;
    }
  });
}

function readPassword(password, callback) {
  if (password === true) {
    prompt('Password: ', true, callback);
  } else {
    async(callback, null, typeof password === 'string' ? password : null);
  }
}

function checkPlausibility(typo) {
  // Check if the typo is 'plausible' (note: quotes).
  var n = trigrams(typo.toLowerCase()).reduce(function (a, v) {
    return a + !!dictionary[v];
  },
  0);

  // If every three-letter sequence in the word occurs at least once in the
  // dictionary, we consider it 'plausible'.
  return n / typo.length >= 1;
}

function generateTypos(word) {
  if (!word.match(wordPattern)) {
    return [];
  }

  var collection = [];

  // Bookkeeping.
  var book = {};

  rulesetOrder.forEach(function (name) {
    if (!rules.hasOwnProperty(name)) {
      // Ruleset is not available.
      return;
    }

    rules[name].forEach(function (rule) {
      var mutation = word.replace(rule.re, rule.sub);

      if (mutation === word
          // Include every mutation no more than once.
          || book.hasOwnProperty(mutation)

          // For QWERTY typos, include the typo only if it passes the
          // 'plausibility' test.
          || (name === 'keyboard' && !checkPlausibility(mutation))
          ) {
        return;
      }

      collection.push(mutation);

      book[mutation] = true;
    });
  });

  return collection;
}

function processWord(word, buffer, offset) {
  // Take the low 4 bits.
  var nibble = 0xF & buffer[offset];

  generateTypos(word).some(function (candidate) {
    if (wordValue(candidate) === nibble) {
      // This typo works.
      word = candidate;

      return true;
    }
  });

  return word;
}

function extractTypos(original, modified) {
  // Compare the two texts to get all the typos.
  var typos = [];

  var offset = 0;

  var i = -1;
  var j = -1;
  var k = -1;

  var c = null;

  for (i = 0; i < modified.length; i++) {
    if (modified[i] !== original[i + offset]) {
      // We've hit a typo!

      var word = '';

      // Add every character until the beginning of the word.
      for (j = i - 1; j >= 0; j--) {
        c = modified[j];

        if (!c.match(wordCharacter)) {
          break;
        }

        word = c + word;
      }

      // Now add every character until the end of the word.
      for (j = i; j < modified.length; j++) {
        c = modified[j];

        if (!c.match(wordCharacter)) {
          break;
        }

        word += c;
      }

      // This is the piece of information we're looking for.
      typos.push(word);

      // Stay in sync with the original text.
      for (k = i + offset; k < original.length; k++) {
        if (!original[k].match(wordCharacter)) {
          break;
        }
      }

      i = j;
      offset = k - j;
    }
  }

  return typos;
}

function extractTyposFromMarkup(markup) {
  var typos = [];

  // Look for our custom markup, which is of the form '{[s/typo/correction/]}'
  var index = markup.indexOf('{[s/');
  while (index !== -1) {
    var x1 = markup.indexOf('/', index + 4) + 1;
    var x2 = markup.indexOf('/', x1);

    // Extract typo and save it.
    typos.push(markup.slice(index + 4, x1 - 1));

    // Also do the substitution on the input text.
    markup = markup.slice(0, index) + markup.slice(x1, x2)
      + markup.slice(x2 + 3);

    index = markup.indexOf('{[s/');
  }

  // By the end of the loop we have both the list of typos and the original
  // text.
  return {
    typos:     typos,
    original:  markup
  };
}

function encryptSecret(secret, format, password, covertext, nosalt,
    authenticated) {
  var salt = hash(!nosalt && covertext || '');
  var extraSalt = !nosalt && crypto.randomBytes(2) || new Buffer(0);

  var encrypted = encrypt(stringToBuffer(secret, format),
      password || '',
      Buffer.concat([ salt, extraSalt ]),
      authenticated);

  return Buffer.concat([ extraSalt, encrypted ]);
}

function decryptPayload(payload, format, password, covertext, nosalt,
    authenticated) {
  var ciphertextBegin = !nosalt ? 2 : 0;

  var salt = hash(!nosalt && covertext || '');
  var extraSalt = payload.slice(0, ciphertextBegin);

  var decrypted = decrypt(payload.slice(ciphertextBegin),
      password || '',
      Buffer.concat([ salt, extraSalt ]),
      authenticated);

  return bufferToString(decrypted, format);
}

function encode(message, secret, password, options) {
  var result = null;

  if (password) {
    say('Password:', new Array(2 + Math.floor(Math.random() * 15)).join('*'));
  }

  say('Encrypting ...');

  var buffer = encryptSecret(secret, options.format, password, message,
      options.deterministic || options.nosalt,
      options.authenticated);

  say('Encrypted secret:', prettyBuffer(buffer));

  say('Buffer size: ' + buffer.length);

  var random = null;
  var odd = false;

  if (!options.deterministic) {
    try {
      random = crypto.randomBytes(2);

      // One in two times add an extra meaningless typo just to throw 'em off.
      // By default we always have an even number of typos. This helps.
      odd = random[1] >= 128;
    } catch (error) {
    }
  }

  // This is the ratio of the total number of typos to the message length. It's
  // the rate at which typos should be introduced. We want to make sure the
  // typos are spread out more or less evenly.
  var density = (buffer.length * 2 + odd) / message.length;

  say('Density: ' + (density * 1000).toFixed(4) + ' per thousand');

  // This is how much we try to squeeze the information into the message.
  var multiplier = 1.0;

  do {
    say('Trying with multiplier ' + multiplier.toFixed(4));

    var workingBuffer = new Buffer(buffer);

    var word = '';
    var count = 0;

    var targetDensity = density * multiplier;

    result = '';

    for (var i = 0; i < message.length; i++) {
      var c = message[i];

      if (c.match(wordCharacter)) {
        word += c;
      } else {
        if (word) {
          // Here we're dividing count by two and rounding down. The offset
          // into the buffer is half of the number of typos already introduced,
          // because each typo carries only 4 bits of information.
          var offset = count >>> 1;
          var newWord = null;

          if (offset < buffer.length) {
            // Adjust the bar for letting in the next typo based on the current
            // rate.
            var bar = count / i / targetDensity || 0;

            if (bar < 1.0) {
              newWord = processWord(word, workingBuffer, offset);
            } else {
              newWord = word;
            }

          } else if (odd) {
            // Throw in the extra typo.
            newWord = processWord(word, random, 0);

          } else {
            newWord = word;
          }

          var replacement = newWord;

          if (newWord !== word) {
            if (options.markup) {
              replacement = '{[s/' + newWord + '/' + word + '/]}';

              // Once you're satisfied with the result, open in Vim and do:
              // %s/{\[s\/\([^\/]\+\)\/[^\/]\+\/\]}/\1/g

            } else if (options.highlight) {
              replacement = stylize(replacement, options.highlight);
            }

            if (offset < buffer.length) {
              // Bring the next 4 bits into position.
              workingBuffer[offset] >>>= 4;
            } else {
              odd = false;
            }

            if (++count >>> 1 >= buffer.length && !odd) {
              // Optimization: We have enough typos now, let's add the rest of
              // the text and get out of this loop.
              result += replacement;
              result += message.slice(i);
              break;
            }
          }

          result += replacement;
          word = '';
        }

        result += c;
      }
    }

    say('Score: ' + count + ' / ' + buffer.length * 2);

    // Try again if required with a higher density.
  } while (count >>> 1 < buffer.length && (multiplier *= 1.1) <= 10.0);

  if (count >>> 1 < buffer.length) {
    // This is the main problem. The input text simply isn't big enough for the
    // secret. For example, you can't encode 'Hello, world!' in 'A quick brown
    // fox jumped over the lazy dog.'
    throw new Error('Not enough text.');
  }

  return result;
}

function decode(message, password, options) {
  var original = null;

  var typos = null;

  say('Extracting typos');

  if (options.original != null) {
    // If we have the original text, we're only interested in extracting the
    // typos.
    typos = extractTypos(original = options.original, message);

  } else {
    // If the original text hasn't been provided, then we assume the input text
    // contains substitution markup, and we try to extract both the list of
    // typos and the original text out of it.
    var obj = extractTyposFromMarkup(message);

    original = obj.original;
    typos = obj.typos;
  }

  if (typos.length % 2 === 1) {
    // Ignore any odd typo at the end.
    typos.pop();
  }

  var buffer = new Buffer(typos.length / 2);

  say('Buffer size: ' + buffer.length);

  for (var i = 0; i < typos.length; i++) {
    var d = wordValue(typos[i]);

    // Read the encrypted secret 4 bits at a time. The even ones are the low 4
    // bits, the odd ones are the high 4 bits.
    if (i % 2 === 0) {
      buffer[i >>> 1] = d;
    } else {
      buffer[i >>> 1] |= d << 4;
    }
  }

  say('Encrypted secret:', prettyBuffer(buffer));

  if (password) {
    say('Password:', new Array(2 + Math.floor(Math.random() * 15)).join('*'));
  }

  say('Decrypting ...');

  // Finally, decrypt the buffer to get the original secret.
  return decryptPayload(buffer, options.format, password, original,
      options.nosalt,
      options.authenticated);
}

function query(q, options) {
  say('Generating typos');

  var data = generateTypos(q || '').map(function (typo) {
    var value = wordValue(typo);

    var grams = trigrams(typo.toLowerCase());
    var hits = grams.reduce(function (a, v) {
      return a + (dictionary[v] || 0);
    },
    0);

    var score = hits / grams.length;

    return { typo: typo, value: value, score: score };
  });

  // Sort by score.
  sortBy(data, 'score').reverse();

  return data.map(function (record) {
    return [
      stylize(record.typo, options.highlight),
      record.value.toString(16).toUpperCase(),
      record.score.toFixed(4),
    ].join('\t');

  }).join(os.EOL);
}

function run() {
  if (process.argv.length <= 2) {
    // No arguments.
    dieOnExit();
    printUsage();
    return;
  }

  var defaultOptions = {
    'version':         false,
    'help':            false,
    'license':         false,
    'view-source':     false,
    'highlight':       null,
    'verbose':         false,
    'secret':          null,
    'decode':          false,
    'file':            null,
    'output-file':     null,
    'original-file':   null,
    'format':          null,
    'password':        false,
    'authenticated':   false,
    'nosalt':          false,
    'markup':          false,
    'deterministic':   false,
    'rulesets':        null,
    'ruleset-file':    null,
    'keyboard-file':   null,
    'dictionary-file': null,
    'query':           null,
  };

  var shortcuts = {
    '-V': '--version',
    '-h': '--help',
    '-?': '--help',
    '-v': '--verbose',
    '-d': '--decode',
    '-f': '--file=',
    '-o': '--output-file=',
    '-g': '--original-file=',
    '-P': '--password',
    '-a': '--authenticated',
    '-q': '--query=',
  };

  var options = parseArgs(process.argv.slice(2), defaultOptions, shortcuts);

  var seeHelp = os.EOL + os.EOL + "See '" + _name + " --help'."
      + os.EOL;

  if (options['!?'].length > 0) {
    var unknown = options['!?'][0];

    console.error("Unknown option '" + unknown + "'." + seeHelp);

    if (unknown.slice(0, 2) === '--') {
      // Find and display close matches using Levenshtein distance.
      printCloseMatches(unknown.slice(2), Object.keys(defaultOptions));
    }

    die();
  }

  if ((options.help || options.version || options.license
        || options['view-source'])
      && Object.keys(options).length > 1) {
    // '--help', '--version', and '--license' do not take any arguments.
    dieOnExit();
    printUsage();
    return;
  }

  if (options.help) {
    printHelp();
    return;
  }

  if (options.version) {
    printVersion();
    return;
  }

  if (options.license) {
    printLicense();
    return;
  }

  if (options['view-source']) {
    printSource();
    return;
  }

  var optKeys = Object.keys(options);

  // There are three 'modes' broadly: encode (default), decode, and query.
  var decodeMode = options.decode;
  var queryMode  = options.hasOwnProperty('query');

  var encodeMode = !decodeMode && !queryMode;

  var validOpts = null;

  // Valid options for each mode.
  if (encodeMode) {
    validOpts = 'highlight verbose secret file output-file format password'
      + ' authenticated nosalt markup deterministic rulesets ruleset-file'
      + ' keyboard-file dictionary-file';
  } else if (decodeMode) {
    validOpts = 'highlight verbose decode file original-file format password'
      + ' authenticated nosalt markup';
  } else if (queryMode) {
    validOpts = 'highlight verbose query rulesets ruleset-file'
      + ' keyboard-file dictionary-file';
  }

  validOpts = validOpts && validOpts.split(' ') || [];

  if (encodeMode + decodeMode + queryMode !== 1
      || !optKeys.every(function (k) { return validOpts.indexOf(k) !== -1 })) {
    dieOnExit();
    printUsage();
    return;
  }

  // If any boolean options have non-boolean (string) values, print usage and
  // exit.
  if (!typeMatch(defaultOptions, options, 'boolean', [ 'password' ])) {
    dieOnExit();
    printUsage();
    return;
  }

  // Positional arguments.
  mapOptions(options, encodeMode ? [ 'secret', 'file' ] : [ 'file' ],
      options['...']);

  if (encodeMode && typeof options.secret !== 'string') {
    dieOnExit();
    printUsage();
    return;
  }

  optKeys.forEach(function (name) {
    if ((name === 'file' || name.slice(-5) === '-file')
        && options[name] === '') {
      die('Filename cannot be blank.' + seeHelp);
    }
  });

  if (decodeMode && !options['original-file'] && !options.markup) {
    die("Required '--original-file' or '--markup' argument." + seeHelp);
  }

  if (options.format != null && options.format !== 'hex'
      && options.format !== 'base64') {
    die("Format must be 'hex' or 'base64'." + seeHelp);
  }

  if (options.verbose) {
    say = sayImpl(function () {
      return '[' + process.uptime().toFixed(2) + ']';
    });
  }

  var isTerminal = function () {
    return !options['output-file'] && process.stdout.isTTY;
  };

  say('Hi!');

  chain([
      function (callback) {
        readPassword(options.password, callback);
      },

      function (password, callback) {
        if (encodeMode || decodeMode) {
          readInput(options.file, function (error, message) {
            callback(error, password, message);
          });

        } else {
          callback(null, password, null);
        }
      },

      function (password, message, callback) {
        if (decodeMode && !options.markup) {
          // Read the original file.
          say('Reading original file ' + options['original-file']);

          slurpFile(options['original-file'], function (error, original) {
            callback(error, password, message, original);
          });

        } else {
          callback(null, password, message, null);
        }
      },

      function (password, message, original, callback) {
        if (encodeMode || queryMode) {
          loadDictionary(options['dictionary-file']);

          loadKeyboard(options['keyboard-file']);

          loadRulesets(options.rulesets, options['ruleset-file']);

          if (encodeMode && !options.deterministic) {
            say('Shuffling rules');

            rulesetOrder.forEach(shuffleRules);
          }
        }

        if (encodeMode) {
          say('Secret: ' + options.secret);

          say('Encoding');

          var encodeOptions = Object.create(options);

          if (!isTerminal()) {
            encodeOptions.highlight = null;
          }

          var output = encode(message, options.secret, password,
              encodeOptions);

          if (!output) {
            throw '';
          }

          callback(null, output);

        } else if (decodeMode) {
          say('Decoding');

          var secret = decode(message, password,
              Object.create(options, { original: { value: original } })
              );

          say('Secret: ' + secret);

          // Note: secret can be an empty string! It's an error only if it's
          // null or undefined.
          if (secret == null) {
            // Throw an empty string to exit quietly with a nonzero exit code.
            throw '';
          }

          callback(null, secret);

        } else if (queryMode) {
          say('Query: ' + options.query);

          callback(null, query(options.query, options));
        }
      }
    ],

    function (error) {
      logError(error);

      say('Sorry, we failed');

      die();
    },

    function (finalResult) {
      say('Almost done!');

      if (!encodeMode || isTerminal()) {
        if (finalResult) {
          console.log(finalResult);
        }
      } else {
        writeOutput(finalResult, options['output-file']);
      }

      say('Goodbye');
    }
  );
}

function main() {
  run();
}

if (require.main === module) {
  main();
}

exports.run = run;

// vim: et ts=2 sw=2
