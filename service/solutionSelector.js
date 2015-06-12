/*
Solution Selector

Service that prints out the best solution that has been proposed for a message
*/

var amqp = require('amqp');
var connect = require('../connect');

var config = connect.config;
var connection = connect.createConnection();
var solutionMap = {};
var MESSAGE_ORIGIN = 'nodejs-trace';


connection.on('error', function (e) {
  console.log('Error connecting the Solution Selector service', e);
});

// Wait for connection to become established.
connection.on('ready', function () {
  console.log('Connection ready');

  // Setup the exchange
  var exchange = connection.exchange(
    config.exchangeName
    , {type: 'fanout', durable: true, autoDelete: false/*, exclusive: false*/}
    , function (exchange) {
      console.log('Exchange ' + exchange.name + ' is open');
  });

  // Use the default 'amq.topic' exchange
  connection.queue(''
    , {exclusive: true/*, durable: true*/}
    , function (q) {
      console.log('Queue connected');
      // Catch all messages
      q.bind(exchange, '', function() {
        console.log('Waiting for solutions on the '+ config.vhost + ' bus');
      });
      // Receive messages
      q.subscribe(function (message) {

        // transform data coming from messages generated by services written in other langs (eg. C# / Ruby)
        if(message.data) {
          message = JSON.parse(message.data.toString());
        }
        if(message.ttl <= 0) {
          return;
        }
        message.ttl--;
        if(!message.solutions || message.solutions.length === 0) {
          return;
        }

        var best = selectBestSolution(message);
        console.log('********** BEST ***********', message.membership_status, best);

      });
  });
});

function getMembershipFactor(membership_status) {
  if(!membership_status) {
    return null;
  }
  switch (membership_status) {
    case 'premium': return 5;
    case 'high': return 4;
    case 'medium': return 3;
    case 'low': return 2;
  }
  return null;
}
function getSolutionFactors(message) {
  return {
    membership: getMembershipFactor(message.membership_status)
  }
}
function getSolutionValue(solution, factors) {
  var membership = factors.membership || 1;
  if(membership) {
    solution.membership_value = membership;
  }
  return solution.likelihood * solution.offerValue * membership;
}

var selectBestSolution = function(message) {

  if(solutionMap[message.messageId]) {
    solutionMap[message.messageId].concat(message.solutions);
  }
  else {
    solutionMap[message.messageId] = message.solutions;
  }
  var solutions = solutionMap[message.messageId];
  var best = solutions[0];
  var solutionFactors = getSolutionFactors(message);
  solutions.forEach(function(solution) {
    if(getSolutionValue(solution, solutionFactors) > getSolutionValue(best, solutionFactors)) {
      best = solution;
    }
  });

  return best;
}
