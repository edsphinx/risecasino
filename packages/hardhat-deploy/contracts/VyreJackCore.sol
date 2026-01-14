// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.28;

/* --------------------------------------------------------------------------
 * VYREJACK V2 — BLACKJACK GAME FOR VYRECASINO
 * -------------------------------------------------------------------------
 * Pure game logic implementing IVyreGame for VyreCasino integration.
 *
 * - Core Flow: VyreCasino.play() → VyreJackCore.play() → VRF → GameResult
 * - Security: Only VyreCasino can initiate games via onlyCasino modifier
 * - Randomness: Uses Rise Chain VRF for provably fair card dealing
 * - Payouts: Handled entirely by VyreCasino via VyreTreasury (no house edge here)
 * - Card Model: Infinite deck to prevent on-chain card counting attacks
 * ------------------------------------------------------------------------*/

import { IVyreGame } from "../../interfaces/IVyreGame.sol";
import { IVRFConsumer } from "../../interfaces/IVRFConsumer.sol";
import { IVRFCoordinator } from "../../interfaces/IVRFCoordinator.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title  VyreJackCore
 * @author edsphinx
 * @custom:company Blocketh
 * @notice Provably fair Blackjack game for VyreCasino ecosystem.
 * @dev    This contract implements the IVyreGame interface for seamless integration
 *         with VyreCasino as the orchestrator. Game logic is pure - no treasury
 *         management, no house edge collection. All financial operations are
 *         delegated to VyreCasino which handles fee distribution via VyreTreasury.
 *
 *         Security Model:
 *         - Infinite Deck: Each card is dealt from a fresh virtual deck (random % 52)
 *           to prevent card counting attacks common in on-chain casinos.
 *         - VRF Integration: All randomness is sourced from Rise Chain's VRF with
 *           async callback pattern for cryptographic security.
 *         - Access Control: Only VyreCasino can call play(), only VRF can callback.
 */
contract VyreJackCore is IVyreGame, IVRFConsumer, Initializable, UUPSUpgradeable {
    // ----------------------------------------------------------------------
    //  CONSTANTS
    // ----------------------------------------------------------------------
    using SafeCast for uint256;

    /// @notice Rise Chain Testnet VRF Coordinator address (fallback if not provided)
    address public constant DEFAULT_VRF_COORDINATOR = 0x9d57aB4517ba97349551C876a01a7580B1338909;

    /// @notice Cards per virtual deck (infinite deck model)
    uint8 public constant CARDS_PER_DECK = 52;

    /// @notice Blackjack payout multiplier (3:2 = 150%)
    uint256 public constant BLACKJACK_PAYOUT = 150;

    /// @notice Standard win payout multiplier (1:1 = 200% return)
    uint256 public constant STANDARD_PAYOUT = 200;

    /// @notice Target hand value for blackjack
    uint8 public constant BLACKJACK_VALUE = 21;

    /// @notice Dealer must stand at this value or higher
    uint8 public constant DEALER_STAND_VALUE = 17;

    /// @notice High value for Ace
    uint8 public constant ACE_HIGH_VALUE = 11;

    /// @notice Low value for Ace (when high would bust)
    uint8 public constant ACE_LOW_VALUE = 1;

    /// @notice Value for face cards (J, Q, K)
    uint8 public constant FACE_CARD_VALUE = 10;

    /// @notice Number of ranks per suit (A-K)
    uint8 public constant RANKS_PER_SUIT = 13;

    // ----------------------------------------------------------------------
    //  STORAGE
    // ----------------------------------------------------------------------

    /// @notice VRF Coordinator for randomness (not immutable for upgradeability)
    IVRFCoordinator public coordinator;

    /// @notice Address of VyreCasino contract (only caller for play())
    address public casino;

    /// @notice Contract owner for administrative functions
    address public owner;

    /// @notice Whether this game is currently accepting new games
    bool public active = true;

    /// @notice Pending owner for two-step transfer
    address public pendingOwner;

    /// @notice Minimum bet limits per token address
    mapping(address => uint256) public minBetByToken;

    /// @notice Maximum bet limits per token address
    mapping(address => uint256) public maxBetByToken;

    /// @notice Default minimum bet (1 token with 18 decimals)
    uint256 public defaultMinBet = 1e18;

    /// @notice Default maximum bet (1000 tokens with 18 decimals)
    uint256 public defaultMaxBet = 1000e18;

    /// @notice Active game state per player address
    mapping(address => Game) public games;

    /// @notice Pending VRF requests awaiting fulfillment
    mapping(uint256 => VRFRequest) public vrfRequests;

    /// @notice Nonce per player for unique VRF seeds
    mapping(address => uint256) public playerNonces;

    // ----------------------------------------------------------------------
    //  STRUCTS
    // ----------------------------------------------------------------------

    /// @notice Represents an active blackjack game
    struct Game {
        address player; // Player address
        address token; // Betting token
        uint256 bet; // Bet amount
        uint8[] playerCards; // Player's hand
        uint8[] dealerCards; // Dealer's hand
        GameState state; // Current game state
        uint256 timestamp; // Game start time
        bool isDoubled; // Whether player doubled down
    }

    /// @notice Pending VRF request tracking
    struct VRFRequest {
        address player; // Player who initiated
        RequestType requestType; // Type of random numbers needed
        bool fulfilled; // Whether callback received
    }

    // ----------------------------------------------------------------------
    //  ENUMS
    // ----------------------------------------------------------------------

    /// @notice Possible states for a blackjack game
    enum GameState {
        Idle, // No active game
        WaitingForDeal, // Awaiting initial 4 cards from VRF
        PlayerTurn, // Player can hit/stand/double
        WaitingForHit, // Awaiting hit card from VRF
        WaitingForDouble, // Awaiting double card from VRF
        DealerTurn, // Dealer is drawing
        PlayerWin, // Player won
        DealerWin, // Dealer won
        Push, // Tie - bet returned
        PlayerBlackjack // Player got natural 21
    }

    /// @notice Types of VRF requests
    enum RequestType {
        InitialDeal, // 4 cards for initial deal
        PlayerHit, // 1 card for player hit
        PlayerDouble, // 1 card for double down (then auto-stand)
        DealerDraw // N cards for dealer draw
    }

    // ----------------------------------------------------------------------
    // ░░  EVENTS
    // ----------------------------------------------------------------------

    /// @notice Emitted when a new game starts
    event GameStarted(address indexed player, address token, uint256 bet);

    /// @notice Emitted when a card is dealt
    event CardDealt(address indexed player, uint8 card, bool isDealer, bool faceUp);

    /// @notice Emitted when hand value is calculated
    event HandValue(address indexed player, uint8 value, bool isSoft, bool isDealer);

    /// @notice Emitted when player takes an action (hit, stand, double, surrender)
    event PlayerAction(address indexed player, string action);

    /// @notice Emitted when game resolves with final result
    event GameResolved(
        address indexed player,
        GameState result,
        uint256 payout,
        uint8 playerFinalValue,
        uint8 dealerFinalValue
    );

    /// @notice Emitted when VRF is requested (for tracking async state)
    event VRFRequested(address indexed player, uint256 requestId, RequestType requestType);

    /// @notice Emitted when dealer hole card is revealed
    event DealerCardRevealed(address indexed player, uint8 card);

    /// @notice Emitted when player busts
    event PlayerBusted(address indexed player, uint8 finalValue);

    /// @notice Emitted when dealer busts
    event DealerBusted(address indexed player, uint8 finalValue);

    /// @notice Emitted when game is activated/deactivated
    event ActiveChanged(bool active);

    /// @notice Emitted when bet limits are updated
    event BetLimitsUpdated(address indexed token, uint256 minBet, uint256 maxBet);

    /// @notice Emitted when default bet limits are updated
    event DefaultBetLimitsUpdated(uint256 minBet, uint256 maxBet);

    /// @notice Emitted when casino address is changed
    event CasinoChanged(address indexed oldCasino, address indexed newCasino);

    /// @notice Emitted when ownership transfer is initiated
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);

    /// @notice Emitted when ownership transfer is completed
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ----------------------------------------------------------------------
    //  MODIFIERS
    // ----------------------------------------------------------------------

    /// @dev Restricts function to VyreCasino contract only
    modifier onlyCasino() {
        require(msg.sender == casino, "VyreJackCore: only casino");
        _;
    }

    /// @dev Restricts function to contract owner
    modifier onlyOwner() {
        require(msg.sender == owner, "VyreJackCore: only owner");
        _;
    }

    /// @dev Restricts function to VRF Coordinator callback
    modifier onlyVRFCoordinator() {
        require(msg.sender == address(coordinator), "VyreJackCore: only VRF");
        _;
    }

    // ----------------------------------------------------------------------
    // ░░  INITIALIZER (UUPS Pattern - replaces constructor)
    // ----------------------------------------------------------------------

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes VyreJackCore with VRF and Casino configuration.
     * @dev Can only be called once via proxy. Use reinitialize() for upgrades.
     * @param _vrfCoordinator Address of VRF Coordinator (use address(0) for Rise testnet default)
     * @param _casino Address of VyreCasino contract that will call play()
     */
    function initialize(
        address _vrfCoordinator,
        address _casino
    ) external initializer {
        // Note: __UUPSUpgradeable_init() removed - not needed in OpenZeppelin 5.x
        
        if (_vrfCoordinator == address(0)) {
            coordinator = IVRFCoordinator(DEFAULT_VRF_COORDINATOR);
        } else {
            coordinator = IVRFCoordinator(_vrfCoordinator);
        }
        casino = _casino;
        owner = msg.sender;
        active = true;
        defaultMinBet = 1e18;
        defaultMaxBet = 1000e18;
    }

    /**
     * @notice Reinitializer for V2 upgrades
     * @dev Call this after upgrading to initialize new V2 state
     */
    function reinitializeV2() external reinitializer(2) {
        // V2 initialization logic goes here
        // Currently empty - add new state initialization as needed
    }

    // ==================== IVyreGame IMPLEMENTATION ====================

    /**
     * @notice Play a blackjack game
     * @dev Called by VyreCasino - starts async VRF flow. Third param (gameData) is unused.
     * @param player Player address
     * @param bet Bet information
     * @return result Game result (initially empty, filled on VRF callback)
     */
    function play(
        address player,
        BetInfo calldata bet,
        bytes calldata /* gameData */
    ) external override onlyCasino returns (GameResult memory result) {
        require(active, "VyreJackCore: game not active");
        require(games[player].state == GameState.Idle, "VyreJackCore: game in progress");

        // Validate bet limits
        uint256 minB = minBetByToken[bet.token];
        uint256 maxB = maxBetByToken[bet.token];
        if (minB == 0) minB = defaultMinBet;
        if (maxB == 0) maxB = defaultMaxBet;
        require(bet.amount >= minB && bet.amount <= maxB, "VyreJackCore: bet out of range");

        // Initialize game
        games[player] = Game({
            player: player,
            token: bet.token,
            bet: bet.amount,
            playerCards: new uint8[](0),
            dealerCards: new uint8[](0),
            state: GameState.WaitingForDeal,
            timestamp: block.timestamp,
            isDoubled: false
        });

        // Request VRF for initial deal
        uint256 nonce = playerNonces[player]++;
        uint256 seed = uint256(keccak256(abi.encode(player, block.timestamp, nonce)));
        uint256 requestId = coordinator.requestRandomNumbers(4, seed);

        vrfRequests[requestId] =
            VRFRequest({ player: player, requestType: RequestType.InitialDeal, fulfilled: false });

        emit GameStarted(player, bet.token, bet.amount);

        // NOTE: Blackjack is async - result is determined on VRF callback
        // For now, return pending result. VyreCasino must handle async games.
        result = GameResult({ won: false, payout: 0, metadata: abi.encode("pending", requestId) });
    }

    function name() external pure override returns (string memory) {
        return "VyreJack";
    }

    function minBet(
        address token
    ) external view override returns (uint256) {
        uint256 min = minBetByToken[token];
        return min > 0 ? min : defaultMinBet;
    }

    function maxBet(
        address token
    ) external view override returns (uint256) {
        uint256 max = maxBetByToken[token];
        return max > 0 ? max : defaultMaxBet;
    }

    function isActive() external view override returns (bool) {
        return active;
    }

    // ==================== VRF CALLBACK ====================

    function rawFulfillRandomNumbers(
        uint256 requestId,
        uint256[] memory randomNumbers
    ) external override onlyVRFCoordinator {
        VRFRequest storage request = vrfRequests[requestId];
        require(request.player != address(0), "VyreJackCore: unknown request");
        require(!request.fulfilled, "VyreJackCore: already fulfilled");

        request.fulfilled = true;
        address player = request.player;

        if (request.requestType == RequestType.InitialDeal) {
            _handleInitialDeal(player, randomNumbers);
        } else if (request.requestType == RequestType.PlayerHit) {
            _handlePlayerHit(player, randomNumbers);
        } else if (request.requestType == RequestType.PlayerDouble) {
            _handlePlayerDouble(player, randomNumbers);
        } else if (request.requestType == RequestType.DealerDraw) {
            _handleDealerDraw(player, randomNumbers);
        }
    }

    // ==================== PLAYER ACTIONS ====================

    function hit() external {
        require(games[msg.sender].state == GameState.PlayerTurn, "VyreJackCore: not your turn");
        games[msg.sender].state = GameState.WaitingForHit;

        emit PlayerAction(msg.sender, "hit");

        uint256 nonce = playerNonces[msg.sender]++;
        uint256 seed = uint256(keccak256(abi.encode(msg.sender, block.timestamp, "hit", nonce)));
        uint256 requestId = coordinator.requestRandomNumbers(1, seed);

        vrfRequests[requestId] = VRFRequest({
            player: msg.sender, requestType: RequestType.PlayerHit, fulfilled: false
        });

        emit VRFRequested(msg.sender, requestId, RequestType.PlayerHit);
    }

    function stand() external {
        require(games[msg.sender].state == GameState.PlayerTurn, "VyreJackCore: not your turn");
        emit PlayerAction(msg.sender, "stand");
        _playDealer(msg.sender);
    }

    /// @notice Double down - double bet, take exactly one card, then stand
    /// @dev Can only be called on initial 2-card hand
    function double() external {
        Game storage game = games[msg.sender];
        require(game.state == GameState.PlayerTurn, "VyreJackCore: not your turn");
        require(game.playerCards.length == 2, "VyreJackCore: can only double on initial hand");
        require(!game.isDoubled, "VyreJackCore: already doubled");

        // Mark as doubled - the bet will be doubled when resolving
        game.isDoubled = true;
        game.state = GameState.WaitingForDouble;

        emit PlayerAction(msg.sender, "double");

        // Request one card, then auto-stand
        uint256 nonce = playerNonces[msg.sender]++;
        uint256 seed = uint256(keccak256(abi.encode(msg.sender, block.timestamp, "double", nonce)));
        uint256 requestId = coordinator.requestRandomNumbers(1, seed);

        vrfRequests[requestId] = VRFRequest({
            player: msg.sender, requestType: RequestType.PlayerDouble, fulfilled: false
        });

        emit VRFRequested(msg.sender, requestId, RequestType.PlayerDouble);
    }

    /// @notice Surrender - forfeit the hand and get half the bet back
    /// @dev Can only be called on initial 2-card hand (late surrender)
    function surrender() external {
        Game storage game = games[msg.sender];
        require(game.state == GameState.PlayerTurn, "VyreJackCore: not your turn");
        require(game.playerCards.length == 2, "VyreJackCore: can only surrender on initial hand");

        emit PlayerAction(msg.sender, "surrender");

        // Return half the bet (effective bet if doubled, though you can't double then surrender)
        uint256 returnAmount = game.bet / 2;
        
        _finishGame(msg.sender, GameState.DealerWin, returnAmount);
    }

    // ==================== INTERNAL LOGIC ====================

    function _handleInitialDeal(
        address player,
        uint256[] memory randomNumbers
    ) internal {
        require(randomNumbers.length >= 4, "Need 4 random numbers");

        Game storage game = games[player];

        uint8 playerCard1 = _randomToCard(randomNumbers[0]);
        uint8 dealerCard1 = _randomToCard(randomNumbers[1]);
        uint8 playerCard2 = _randomToCard(randomNumbers[2]);
        uint8 dealerCard2 = _randomToCard(randomNumbers[3]);

        game.playerCards.push(playerCard1);
        game.dealerCards.push(dealerCard1);
        game.playerCards.push(playerCard2);
        game.dealerCards.push(dealerCard2);

        emit CardDealt(player, playerCard1, false, true);
        emit CardDealt(player, dealerCard1, true, true);
        emit CardDealt(player, playerCard2, false, true);
        emit CardDealt(player, dealerCard2, true, false);

        (uint8 playerValue,) = calculateHandValue(game.playerCards);
        (uint8 dealerValue,) = calculateHandValue(game.dealerCards);

        emit HandValue(player, playerValue, false, false);

        if (playerValue == 21 && dealerValue == 21) {
            _finishGame(player, GameState.Push, game.bet);
        } else if (playerValue == 21) {
            uint256 payout = (game.bet * BLACKJACK_PAYOUT) / 100 + game.bet;
            _finishGame(player, GameState.PlayerBlackjack, payout);
        } else if (dealerValue == 21) {
            _finishGame(player, GameState.DealerWin, 0);
        } else {
            game.state = GameState.PlayerTurn;
        }
    }

    function _handlePlayerHit(
        address player,
        uint256[] memory randomNumbers
    ) internal {
        require(randomNumbers.length >= 1, "Need 1 random number");

        Game storage game = games[player];
        uint8 newCard = _randomToCard(randomNumbers[0]);
        game.playerCards.push(newCard);

        emit CardDealt(player, newCard, false, true);

        (uint8 playerValue,) = calculateHandValue(game.playerCards);
        emit HandValue(player, playerValue, false, false);

        if (playerValue > 21) {
            _finishGame(player, GameState.DealerWin, 0);
        } else if (playerValue == 21 || game.isDoubled) {
            _playDealer(player);
        } else {
            game.state = GameState.PlayerTurn;
        }
    }

    /// @notice Handle double down card - take one card then auto-stand to dealer
    function _handlePlayerDouble(
        address player,
        uint256[] memory randomNumbers
    ) internal {
        require(randomNumbers.length >= 1, "Need 1 random number");

        Game storage game = games[player];
        uint8 newCard = _randomToCard(randomNumbers[0]);
        game.playerCards.push(newCard);

        emit CardDealt(player, newCard, false, true);

        (uint8 playerValue,) = calculateHandValue(game.playerCards);
        emit HandValue(player, playerValue, false, false);

        // After double, always go to dealer (auto-stand)
        if (playerValue > 21) {
            // Busted on double - lose double the bet
            _finishGame(player, GameState.DealerWin, 0);
        } else {
            // Auto-stand after double
            _playDealer(player);
        }
    }

    function _handleDealerDraw(
        address player,
        uint256[] memory randomNumbers
    ) internal {
        Game storage game = games[player];

        for (uint256 i = 0; i < randomNumbers.length; i++) {
            uint8 newCard = _randomToCard(randomNumbers[i]);
            game.dealerCards.push(newCard);
            emit CardDealt(player, newCard, true, true);
        }

        _resolveDealerHand(player);
    }

    function _playDealer(
        address player
    ) internal {
        Game storage game = games[player];
        game.state = GameState.DealerTurn;

        if (game.dealerCards.length >= 2) {
            emit CardDealt(player, game.dealerCards[1], true, true);
        }

        (uint8 dealerValue, bool isSoft) = calculateHandValue(game.dealerCards);
        emit HandValue(player, dealerValue, isSoft, true);

        uint8 cardsNeeded = 0;
        uint8 tempValue = dealerValue;
        bool tempSoft = isSoft;

        while (_shouldDealerHit(tempValue, tempSoft) && cardsNeeded < 5) {
            cardsNeeded++;
            tempValue += 7;
            if (tempValue > 21 && tempSoft) {
                tempValue -= 10;
                tempSoft = false;
            }
        }

        if (cardsNeeded > 0) {
            uint256 nonce = playerNonces[player]++;
            uint256 seed = uint256(keccak256(abi.encode(player, block.timestamp, "dealer", nonce)));
            uint256 requestId = coordinator.requestRandomNumbers(cardsNeeded, seed);

            vrfRequests[requestId] = VRFRequest({
                player: player, requestType: RequestType.DealerDraw, fulfilled: false
            });
        } else {
            _resolveGame(player);
        }
    }

    function _resolveDealerHand(
        address player
    ) internal {
        Game storage game = games[player];
        (uint8 dealerValue, bool isSoft) = calculateHandValue(game.dealerCards);
        emit HandValue(player, dealerValue, isSoft, true);

        if (_shouldDealerHit(dealerValue, isSoft) && game.dealerCards.length < 10) {
            uint256 nonce = playerNonces[player]++;
            uint256 seed = uint256(
                keccak256(abi.encode(player, block.timestamp, game.dealerCards.length, nonce))
            );
            uint256 requestId = coordinator.requestRandomNumbers(1, seed);

            vrfRequests[requestId] = VRFRequest({
                player: player, requestType: RequestType.DealerDraw, fulfilled: false
            });
        } else {
            _resolveGame(player);
        }
    }

    function _shouldDealerHit(
        uint8 value,
        bool isSoft
    ) internal pure returns (bool) {
        if (value < 17) return true;
        if (value == 17 && isSoft) return true;
        return false;
    }

    function _resolveGame(
        address player
    ) internal {
        Game storage game = games[player];

        (uint8 playerValue,) = calculateHandValue(game.playerCards);
        (uint8 dealerValue,) = calculateHandValue(game.dealerCards);

        // Effective bet is doubled if player doubled down
        uint256 effectiveBet = game.isDoubled ? game.bet * 2 : game.bet;

        uint256 payout = 0;
        GameState result;

        if (dealerValue > 21) {
            result = GameState.PlayerWin;
            payout = effectiveBet * 2;
        } else if (playerValue > dealerValue) {
            result = GameState.PlayerWin;
            payout = effectiveBet * 2;
        } else if (dealerValue > playerValue) {
            result = GameState.DealerWin;
            payout = 0;
        } else {
            result = GameState.Push;
            payout = effectiveBet; // Return the effective bet on push
        }

        _finishGame(player, result, payout);
    }

    function _finishGame(
        address player,
        GameState result,
        uint256 payout
    ) internal {
        Game storage game = games[player];
        game.state = result;

        // Emit event for indexer
        emit IVyreGame.GamePlayed(player, game.token, game.bet, payout > game.bet, payout);

        // Reset game
        delete games[player];

        // TODO: Notify VyreCasino of result for payout
        // This requires VyreCasino to have a callback or poll mechanism
    }

    // ==================== CARD LOGIC ====================

    function _randomToCard(
        uint256 randomNumber
    ) internal pure returns (uint8) {
        // Safe: modulo CARDS_PER_DECK (52) always returns 0-51, fits in uint8
        uint256 cardIndex = randomNumber % CARDS_PER_DECK;
        return cardIndex.toUint8();
    }

    function calculateHandValue(
        uint8[] memory cards
    ) public pure returns (uint8 value, bool isSoft) {
        uint8 aceCount = 0;
        value = 0;

        for (uint256 i = 0; i < cards.length; i++) {
            uint8 cardRank = cards[i] % RANKS_PER_SUIT;

            if (cardRank == 0) {
                aceCount++;
                value += ACE_HIGH_VALUE;
            } else if (cardRank >= 10) {
                value += FACE_CARD_VALUE;
            } else {
                value += cardRank + 1;
            }
        }

        isSoft = aceCount > 0;
        while (value > BLACKJACK_VALUE && aceCount > 0) {
            value -= 10;
            aceCount--;
        }

        isSoft = isSoft && aceCount > 0;
    }

    // ==================== EMERGENCY ADMIN ====================

    /// @notice Event emitted when a game is force-resolved by admin
    event GameForceResolved(address indexed player, uint256 betRefunded, string reason);

    /**
     * @notice Force-resolve a stuck game (admin emergency function)
     * @dev Only owner can call. Resets game state and emits resolution event.
     *      Use when game is stuck due to VRF timeout, relay issues, etc.
     * @param player The player whose game to force-resolve
     * @param reason Reason for force resolution (for logging)
     */
    function forceResolveGame(
        address player,
        string calldata reason
    ) external onlyOwner {
        Game storage game = games[player];
        require(game.state != GameState.Idle, "VyreJackCore: no active game");

        uint256 betAmount = game.bet;

        // Reset game state
        delete games[player];

        emit GameForceResolved(player, betAmount, reason);
        emit GameResolved(
            player,
            GameState.Idle,
            0,  // No payout
            0,  // playerFinalValue
            0   // dealerFinalValue
        );
    }


    // ==================== ADMIN ====================


    function setCasino(
        address _casino
    ) external onlyOwner {
        require(_casino != address(0), "VyreJackCore: zero casino");
        address oldCasino = casino;
        casino = _casino;
        emit CasinoChanged(oldCasino, _casino);
    }

    function setActive(
        bool _active
    ) external onlyOwner {
        active = _active;
        emit ActiveChanged(_active);
    }

    function setBetLimits(
        address token,
        uint256 min,
        uint256 max
    ) external onlyOwner {
        require(max > min, "Invalid limits");
        minBetByToken[token] = min;
        maxBetByToken[token] = max;
        emit BetLimitsUpdated(token, min, max);
    }

    function setDefaultBetLimits(
        uint256 min,
        uint256 max
    ) external onlyOwner {
        require(max > min, "Invalid limits");
        defaultMinBet = min;
        defaultMaxBet = max;
        emit DefaultBetLimitsUpdated(min, max);
    }

    function transferOwnership(
        address newOwner
    ) external onlyOwner {
        require(newOwner != address(0), "Invalid owner");
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "VyreJackCore: not pending owner");
        emit OwnershipTransferred(owner, pendingOwner);
        owner = pendingOwner;
        pendingOwner = address(0);
    }

    // ==================== UUPS UPGRADE ====================

    /**
     * @notice Authorizes contract upgrades (required by UUPS)
     * @dev Only owner can authorize upgrades
     * @param newImplementation Address of the new implementation contract
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        // Owner authorization is the only check needed
    }

    // ==================== VIEW ====================

    function getGame(
        address player
    )
        external
        view
        returns (
            address token,
            uint256 bet,
            uint8[] memory playerCards,
            uint8[] memory dealerCards,
            GameState state
        )
    {
        Game storage game = games[player];
        return (game.token, game.bet, game.playerCards, game.dealerCards, game.state);
    }
}
