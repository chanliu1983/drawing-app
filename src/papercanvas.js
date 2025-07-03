import { useState, useEffect, useRef, useCallback } from "react";
import paper from "paper";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import Editor from "@monaco-editor/react";
// Removed initialData import - now loading from database
import dbService from "./dbService";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const PaperCanvas = () => {
  const canvasRef = useRef(null);
  const resizeCanvasRef = useRef(null);
  const [boxes, setBoxes] = useState([]);
  const [connections, setConnections] = useState([]);
  const [jsonData, setJsonData] = useState({ boxes: [], connections: [] });
  const [editorValue, setEditorValue] = useState(
    JSON.stringify({ boxes: [], connections: [] }, null, 2)
  );

  // Toolbox state
  const [toolboxCollapsed, setToolboxCollapsed] = useState(false);
  const [toolboxPosition, setToolboxPosition] = useState({ x: 10, y: 10 });
  // Removed selectedMode - using only currentMode for simplicity
  const [newStockName, setNewStockName] = useState("");
  const [newStockAmount, setNewStockAmount] = useState(0);
  const [newStockShape, setNewStockShape] = useState("rectangle"); // 'rectangle' or 'circle'
  const [selectedItem, setSelectedItem] = useState(null); // Unified selection for stock or connection
  const editorRef = useRef(null);
  const [jsonEditorVisible, setJsonEditorVisible] = useState(true); // Control JSON editor visibility

  // Function to highlight and scroll to selected item in JSON editor
  const highlightSelectedItemInEditor = useCallback(
    (item) => {
      if (!editorRef.current || !item || !jsonEditorVisible) return;

      const editor = editorRef.current;
      const model = editor.getModel();
      if (!model) return;

      const jsonText = model.getValue();
      let searchPattern = "";
      let itemId = "";

      if (item.type === "stock") {
        itemId = item.id;
        searchPattern = `"id":s*"${itemId}"`;
      } else if (item.type === "connection") {
        itemId = item.id;
        searchPattern = `"id":s*"${itemId}"`;
      }

      if (!searchPattern) return;

      // Find the pattern in the JSON text
      const regex = new RegExp(searchPattern, "g");
      const match = regex.exec(jsonText);

      if (match) {
        const startPos = model.getPositionAt(match.index);

        // Find the start and end of the JSON object
        let objectStart = match.index;
        let braceCount = 0;
        let objectEnd = match.index;

        // Find the start of the object (look backwards for opening brace)
        for (let i = match.index; i >= 0; i--) {
          if (jsonText[i] === "}") braceCount++;
          if (jsonText[i] === "{") {
            if (braceCount === 0) {
              objectStart = i;
              break;
            }
            braceCount--;
          }
        }

        // Find the end of the object (look forwards for closing brace)
        braceCount = 0;
        for (let i = objectStart; i < jsonText.length; i++) {
          if (jsonText[i] === "{") braceCount++;
          if (jsonText[i] === "}") {
            braceCount--;
            if (braceCount === 0) {
              objectEnd = i + 1;
              break;
            }
          }
        }

        const startPosition = model.getPositionAt(objectStart);
        const endPosition = model.getPositionAt(objectEnd);

        // Clear previous decorations
        const oldDecorations = editor.deltaDecorations([], []);

        // Add highlight decoration
        const decorations = editor.deltaDecorations(oldDecorations, [
          {
            range: {
              startLineNumber: startPosition.lineNumber,
              startColumn: startPosition.column,
              endLineNumber: endPosition.lineNumber,
              endColumn: endPosition.column,
            },
            options: {
              className: "selected-json-highlight",
              isWholeLine: false,
            },
          },
        ]);

        // Scroll to the highlighted section
        editor.revealRangeInCenter({
          startLineNumber: startPosition.lineNumber,
          startColumn: startPosition.column,
          endLineNumber: endPosition.lineNumber,
          endColumn: endPosition.column,
        });

        // Store decorations for cleanup
        editor._selectedItemDecorations = decorations;
      }
    },
    [jsonEditorVisible]
  );

  // Effect to highlight selected item in JSON editor
  useEffect(() => {
    if (selectedItem && jsonEditorVisible) {
      // Small delay to ensure editor is ready
      setTimeout(() => {
        highlightSelectedItemInEditor(selectedItem);
      }, 100);
    }
  }, [selectedItem, jsonEditorVisible, highlightSelectedItemInEditor]);

  const [editingItem, setEditingItem] = useState(null); // For editing form (stock or connection)
  const [selectedBoxId, setSelectedBoxId] = useState(null); // Track selected box
  // Removed editMode - now context-sensitive based on selection
  const [splitSize, setSplitSize] = useState("70%"); // Control split pane size

  // Canvas management state
  const [availableCanvases, setAvailableCanvases] = useState([]);
  const [currentCanvasName, setCurrentCanvasName] = useState("default");
  const [showNewCanvasDialog, setShowNewCanvasDialog] = useState(false);
  const [newCanvasName, setNewCanvasName] = useState("");

  // Simulation state
  const [simulationSteps, setSimulationSteps] = useState(0);

  const [simulationHistory, setSimulationHistory] = useState([]); // Track stock amounts over time
  const [showPlotPanel, setShowPlotPanel] = useState(false);
  // Zoom state for Paper.js view
  const [zoom, setZoom] = useState(1);
  const [selectedStockForPlot, setSelectedStockForPlot] = useState("");
  const [selectedStocksForSum, setSelectedStocksForSum] = useState([]); // For multiple stock selection
  const [plotMode, setPlotMode] = useState("single"); // "single" or "sum"

  // Mode system - only one mode can be active at a time
  const [currentMode, setCurrentMode] = useState("normal"); // 'normal', 'add', 'edit', 'connect'
  const [pendingStockData, setPendingStockData] = useState(null);
  const [connectionStart, setConnectionStart] = useState(null);
  const [tempConnectionLine, setTempConnectionLine] = useState(null);
  
  // Edit mode filter toggle
  const [editModeFilterEnabled, setEditModeFilterEnabled] = useState(false); // toggle for filtering in edit mode

  const paperState = useRef({
    boxes: [],
    connections: [],
    lastWidth: null,
    lastHeight: null,
  });
  paperState.current.boxes = boxes;
  paperState.current.connections = connections;

  // Draw axes function moved outside useEffect for reuse
  const drawAxes = () => {
    // Remove old axes if they exist to prevent duplicates on resize
    paper.project.getItems({ name: "axis" }).forEach((item) => item.remove());

    if (!paper.view) return;

    const origin = new paper.Point(50, paper.view.size.height - 50);
    const viewSize = paper.view.size;

    // X-axis
    const xAxis = new paper.Path.Line(
      new paper.Point(0, origin.y),
      new paper.Point(viewSize.width, origin.y)
    );
    xAxis.strokeColor = "grey";
    xAxis.name = "axis";

    // Y-axis
    const yAxis = new paper.Path.Line(
      new paper.Point(origin.x, 0),
      new paper.Point(origin.x, viewSize.height)
    );
    yAxis.strokeColor = "grey";
    yAxis.name = "axis";

    // Origin text
    const originText = new paper.PointText(origin.add(5, -10));
    originText.content = `(0,0)`;
    originText.fillColor = "black";
    originText.fontSize = 12;
    originText.name = "axis";

    // X-axis label
    const xLabel = new paper.PointText(
      new paper.Point(viewSize.width - 20, origin.y - 10)
    );
    xLabel.content = "x";
    xLabel.fillColor = "grey";
    xLabel.name = "axis";

    // Y-axis label
    const yLabel = new paper.PointText(new paper.Point(origin.x + 10, 20));
    yLabel.content = "y";
    yLabel.fillColor = "grey";
    yLabel.name = "axis";
  };

  // Connection tool functions
  const handleConnectionClick = (stockId) => {
    if (!connectionStart) {
      // Start a new connection
      setConnectionStart(stockId);
    } else {
      // Complete the connection
      createNewConnection(connectionStart, stockId);
      // Switch back to normal mode after creating connection
      setCurrentMode("normal");
      // Reset connection state
      setConnectionStart(null);
      if (tempConnectionLine) {
        tempConnectionLine.remove();
        setTempConnectionLine(null);
      }
    }
  };

  // Helper function to generate unique IDs across both stocks and connections
  const getNextUniqueId = () => {
    const stockIds = jsonData.boxes.map((b) => b.id || 0);
    const connectionIds = jsonData.connections.map((c) => c.id || 0);
    const allIds = [...stockIds, ...connectionIds];
    return Math.max(0, ...allIds) + 1;
  };

  const createNewConnection = (fromStockId, toStockId) => {
    const newId = getNextUniqueId();
    const fromStockData = jsonData.boxes.find((box) => box.id === fromStockId);
    const toStockData = jsonData.boxes.find((box) => box.id === toStockId);
    const connectionName =
      fromStockData && toStockData
        ? `${fromStockData.name} -> ${toStockData.name}`
        : `Connection ${newId}`;

    // Default values for amount
    // Using numbers by default for new connections
    const amount = 1;

    const newConnection = {
      id: newId,
      name: connectionName,
      type: "feedback_loop",
      fromStockId: fromStockId,
      toStockId: toStockId,
      amount: amount, // Amount transferred from source to destination
      isOverflow: false, // New property: whether this is an overflow connection
      order: newId, // New property: order in which connections are processed during simulation
      // Note: A connection can only be either an overflow connection or have an amount, not both.
      // If isOverflow is true, amount should be 0.
    };
    // Find the stock groups for visual connection
    const fromStockGroup = paperState.current.boxes.find(
      (box) => box.stockId === fromStockId
    );
    const toStockGroup = paperState.current.boxes.find(
      (box) => box.stockId === toStockId
    );
    if (fromStockGroup && toStockGroup) {
      // Create visual connection immediately
      const visualConnection = createConnection(
        fromStockGroup,
        toStockGroup,
        newConnection
      );
      paperState.current.connections.push(visualConnection);
      setConnections((prev) => [...prev, visualConnection]);
      if (paper.view) paper.view.draw();
    }
    // Update jsonData without triggering box recreation
    setJsonData((prev) => ({
      ...prev,
      connections: [...prev.connections, newConnection],
    }));

    // Force a re-render to update the JSON editor
    if (paper.view) paper.view.draw();
  };

  const cancelConnectionTool = () => {
    setCurrentMode("normal");
    setConnectionStart(null);
    if (tempConnectionLine) {
      tempConnectionLine.remove();
      setTempConnectionLine(null);
    }
  };

  // Canvas management functions
  const loadAvailableCanvases = async () => {
    try {
      const canvasNames = await dbService.getAllCanvasNames();
      setAvailableCanvases(canvasNames);
    } catch (error) {
      console.error("Failed to load available canvases:", error);
    }
  };

  const saveCurrentCanvas = async (name = currentCanvasName) => {
    console.log("Save button clicked! Current canvas name:", name);
    console.log("Current jsonData:", jsonData);
    try {
      await dbService.saveCanvas(name, jsonData);

      if (!availableCanvases.includes(name)) {
        setAvailableCanvases((prev) => [...prev, name].sort());
      }
    } catch (error) {
      console.error("Failed to save canvas:", error);
    }
  };

  // Helper function to ensure all boxes have simulationAmount and overflowAmount initialized
  // Note: This function initializes simulationAmount but does not enforce capacity limits
  // Capacity limits are enforced during the simulation when amounts are transferred
  const ensureSimulationAmount = (data) => {
    if (data && data.boxes) {
      return {
        ...data,
        boxes: data.boxes.map((box) => {
          // Ensure amount is a valid number
          const validAmount =
            typeof box.amount === "number" && !isNaN(box.amount)
              ? box.amount
              : 0;
          // Ensure simulationAmount is a valid number
          let validSimulationAmount;
          if (box.simulationAmount !== undefined) {
            const parsed =
              typeof box.simulationAmount === "number"
                ? box.simulationAmount
                : parseFloat(box.simulationAmount);
            validSimulationAmount = !isNaN(parsed) ? parsed : validAmount;
          } else {
            validSimulationAmount = validAmount;
          }

          // Initialize overflowAmount to 0
          // This tracks the amount that exceeds capacity during simulation
          const overflowAmount =
            box.overflowAmount !== undefined &&
            !isNaN(parseFloat(box.overflowAmount))
              ? parseFloat(box.overflowAmount)
              : 0;

          return {
            ...box,
            amount: validAmount,
            simulationAmount: validSimulationAmount,
            overflowAmount: overflowAmount,
          };
        }),
      };
    }
    return data;
  };

  const loadCanvas = async (name) => {
    try {
      const canvasData = await dbService.loadCanvas(name);
      if (canvasData) {
        const dataWithSimulation = ensureSimulationAmount(canvasData);
        setJsonData(dataWithSimulation);
        setEditorValue(JSON.stringify(dataWithSimulation, null, 2));
        setCurrentCanvasName(name);
      } else {
      }
    } catch (error) {
      console.error("Failed to load canvas:", error);
      alert("Failed to load canvas. Please try again.");
    }
  };

  const createNewCanvas = async (name) => {
    if (!name.trim()) {
      alert("Please enter a canvas name");
      return;
    }

    if (await dbService.canvasExists(name)) {
      alert("A canvas with this name already exists");
      return;
    }

    const newCanvasData = {
      boxes: [],
      connections: [],
    };

    try {
      await dbService.saveCanvas(name, newCanvasData);
      setJsonData(newCanvasData);
      setEditorValue(JSON.stringify(newCanvasData, null, 2));
      setCurrentCanvasName(name);
      setAvailableCanvases((prev) => [...prev, name].sort());
      setShowNewCanvasDialog(false);
      setNewCanvasName("");
    } catch (error) {
      console.error("Failed to create new canvas:", error);
      alert("Failed to create new canvas. Please try again.");
    }
  };

  const handleCanvasSelection = (selectedValue) => {
    if (selectedValue === "new_canvas") {
      setShowNewCanvasDialog(true);
    } else {
      loadCanvas(selectedValue);
    }
  };

  // This ref will track if Paper.js has been initialized
  const paperInitialized = useRef(false);

  // Update Paper.js view zoom when zoom state changes
  useEffect(() => {
    if (paper && paper.view) {
      paper.view.zoom = zoom;
    }
  }, [zoom]);

  // Initialize database and load available canvases
  useEffect(() => {
    const initializeDatabase = async () => {
      try {
        await dbService.init();
        await loadAvailableCanvases();

        // Save the default canvas if it doesn't exist
        if (!(await dbService.canvasExists("default"))) {
          const defaultData = { boxes: [], connections: [] };
          await dbService.saveCanvas("default", defaultData);
          setAvailableCanvases((prev) => ["default", ...prev].sort());
        }
      } catch (error) {
        console.error("Failed to initialize database:", error);
      }
    };

    initializeDatabase();
  }, []);

  useEffect(() => {
    if (!canvasRef.current) {
      console.error("Canvas ref is null");
      return;
    }

    // Only do the full setup if Paper.js hasn't been initialized yet
    // This prevents clearing the canvas when toggling the JSON editor
    if (!paperInitialized.current) {
      console.log("Initializing Paper.js for the first time");
      paper.setup(canvasRef.current);
      paperInitialized.current = true;

      // Add canvas dragging functionality in normal mode
      const tool = new paper.Tool();
      let lastPoint = null;

      tool.onMouseDown = (event) => {
        // Get current mode
        const getCurrentMode = () => {
          const modeSelect = document.querySelector("#mode-select");
          return modeSelect ? modeSelect.value : "normal";
        };

        // Only enable canvas dragging in normal mode
        if (getCurrentMode() === "normal") {
          // Check if we're clicking on empty space (not on any item)
          const hitResult = paper.project.hitTest(event.point);
          if (
            !hitResult ||
            (hitResult.item && hitResult.item.name === "axis")
          ) {
            lastPoint = event.point.clone();
          }
        }
      };

      tool.onMouseDrag = (event) => {
        // Get current mode
        const getCurrentMode = () => {
          const modeSelect = document.querySelector("#mode-select");
          return modeSelect ? modeSelect.value : "normal";
        };

        // Only enable canvas dragging in normal mode
        if (getCurrentMode() === "normal" && lastPoint) {
          // Calculate the delta movement
          const delta = event.point.subtract(lastPoint);

          // Move all items in the project
          paper.project.getItems().forEach((item) => {
            item.position = item.position.add(delta);
          });

          // Update lastPoint for the next drag event
          lastPoint = event.point.clone();

          // Update the JSON data to reflect the new positions
          setJsonData((prev) => {
            const newBoxes = prev.boxes.map((box) => {
              const paperBox = paperState.current.boxes.find(
                (pb) => pb.stockId === box.id
              );
              if (paperBox) {
                return {
                  ...box,
                  position: {
                    x: Math.round(paperBox.position.x),
                    y: Math.round(paperBox.position.y),
                  },
                };
              }
              return box;
            });
            return { ...prev, boxes: newBoxes };
          });

          // Redraw the view
          paper.view.draw();
        }
      };

      tool.onMouseUp = () => {
        lastPoint = null;
      };
    } else {
      // If Paper.js is already initialized, just update the view
    }

    const updateConnectionsForResize = () => {
      if (!jsonData || !jsonData.connections) return;

      paperState.current.connections.forEach((connection, index) => {
        const connData = jsonData.connections[index];
        if (!connData) return;

        const fromStock = paperState.current.boxes.find(
          (box) => box.stockId === connData.fromStockId
        );
        const toStock = paperState.current.boxes.find(
          (box) => box.stockId === connData.toStockId
        );

        if (!fromStock || !toStock) return;

        const end = getEdgePoint(fromStock, toStock);
        const start = getEdgePoint(toStock, fromStock);

        // Calculate direction and apply direction-based handle logic
        const arrowSize = 8;
        const rawDirection = end.subtract(start);
        let direction;
        if (Math.abs(rawDirection.x) > Math.abs(rawDirection.y)) {
          direction = new paper.Point(rawDirection.x > 0 ? 1 : -1, 0);
        } else {
          direction = new paper.Point(0, rawDirection.y > 0 ? 1 : -1);
        }
        const arrowBase = end.subtract(direction.multiply(arrowSize));

        // Handle calculations should follow the arrow direction
        let handle1, handle2;
        if (Math.abs(direction.x) > 0) {
          // Horizontal arrow - curve should be vertical
          handle1 = new paper.Point((start.x + arrowBase.x) / 2, start.y);
          handle2 = new paper.Point((start.x + arrowBase.x) / 2, arrowBase.y);
        } else {
          // Vertical arrow - curve should be horizontal
          handle1 = new paper.Point(start.x, (start.y + arrowBase.y) / 2);
          handle2 = new paper.Point(arrowBase.x, (start.y + arrowBase.y) / 2);
        }

        // Access the path (first child) from the connection group
        const path = connection.children[0];
        if (path && path.segments && path.segments.length === 2) {
          path.segments[0].point = start;
          path.segments[1].point = arrowBase;
          path.segments[0].handleOut = handle1.subtract(start);
          path.segments[1].handleIn = handle2.subtract(arrowBase);
        }

        // Update arrow head (second child) with proper direction-based calculations
        const arrowHead = connection.children[1];
        if (arrowHead && arrowHead.segments) {
          const perpendicular = new paper.Point(-direction.y, direction.x);
          const arrowLeft = arrowBase.add(
            perpendicular.multiply(arrowSize / 2)
          );
          const arrowRight = arrowBase.subtract(
            perpendicular.multiply(arrowSize / 2)
          );
          arrowHead.segments[0].point = end; // arrowTip
          arrowHead.segments[1].point = arrowLeft;
          arrowHead.segments[2].point = arrowRight;
        }
      });
    };

    const resizeCanvas = () => {
      if (!canvasRef.current || !canvasRef.current.parentElement) return;

      const canvasContainer = canvasRef.current.parentElement;
      const newWidth = canvasContainer.clientWidth;
      const newHeight = canvasContainer.clientHeight;

      const oldHeight = paperState.current.lastHeight;

      // Handle height changes - move boxes to maintain relative position from bottom
      if (oldHeight !== null) {
        const deltaY = newHeight - oldHeight;
        if (deltaY !== 0) {
          // Update Paper.js objects only - avoid triggering useEffect re-render
          paperState.current.boxes.forEach((box) => {
            box.position.y += deltaY;
          });
          // Also update jsonData.boxes positions to match Paper.js box positions
          setJsonData((prev) => {
            const newBoxes = prev.boxes.map((box) => {
              const paperBox = paperState.current.boxes.find(
                (pb) => pb.stockId === box.id
              );
              if (paperBox) {
                return {
                  ...box,
                  position: {
                    x: Math.round(paperBox.position.x),
                    y: Math.round(paperBox.position.y),
                  },
                };
              }
              return box;
            });
            return { ...prev, boxes: newBoxes };
          });
        }
      }

      // Store new dimensions
      paperState.current.lastWidth = newWidth;
      paperState.current.lastHeight = newHeight;

      // Update canvas dimensions
      canvasRef.current.width = newWidth;
      canvasRef.current.height = newHeight;

      // Update Paper.js view size without scaling content
      if (paper.view) {
        paper.view.setViewSize(new paper.Size(newWidth, newHeight));
      }

      // Ensure pixel ratio is maintained
      const pixelRatio = window.devicePixelRatio || 1;
      canvasRef.current.style.width = newWidth + "px";
      canvasRef.current.style.height = newHeight + "px";
      canvasRef.current.width = newWidth * pixelRatio;
      canvasRef.current.height = newHeight * pixelRatio;
      if (paper.view) {
        paper.view.setViewSize(new paper.Size(newWidth, newHeight));
      }

      const ctx = canvasRef.current.getContext("2d");
      ctx.scale(pixelRatio, pixelRatio);

      updateConnectionsForResize();
      drawAxes();
      if (paper.view) paper.view.draw();
    };
    resizeCanvasRef.current = resizeCanvas;

    // --- Add ResizeObserver to keep canvas in sync with pane size ---
    let observer = null;
    if (canvasRef.current && canvasRef.current.parentElement) {
      observer = new window.ResizeObserver(() => {
        resizeCanvas();
      });
      observer.observe(canvasRef.current.parentElement);
    }

    if (paperState.current.lastWidth === null) {
      paperState.current.lastWidth = window.innerWidth * 0.75; // Initial 75% width
    }
    if (paperState.current.lastHeight === null) {
      paperState.current.lastHeight = window.innerHeight;
    }

    resizeCanvas();
    setTimeout(() => {
      drawAxes();
      if (paper.view) paper.view.draw();
    }, 0);
    window.addEventListener("resize", resizeCanvas);

    return () => {
      paper.project.clear();
      window.removeEventListener("resize", resizeCanvas);
      if (observer && canvasRef.current && canvasRef.current.parentElement) {
        observer.unobserve(canvasRef.current.parentElement);
      }
    };
  }, []);

  // Handle JSON data changes to render stocks and feedback loops
  useEffect(() => {
    if (!jsonData || !jsonData.boxes) return;

    // Clear existing items except axes
    paper.project.getItems().forEach((item) => {
      if (item.name !== "axis") {
        item.remove();
      }
    });

    const newBoxes = [];
    const newConnections = [];

    // Apply filter if edit mode filter is enabled
    let visibleElements = { stocks: new Set(), connections: new Set() };
    if (currentMode === "edit" && editModeFilterEnabled && selectedItem) {
      visibleElements = getConnectedElements(selectedItem);
    }

    // Create stocks from JSON data
    jsonData.boxes.forEach((stockData, index) => {
      // Skip rendering if filter is enabled and this stock is not visible
      if (currentMode === "edit" && editModeFilterEnabled && selectedItem && !visibleElements.stocks.has(stockData.id)) {
        return;
      }
      const boxWidth = 80;
      const boxHeight = 50; // Increased height to accommodate name and amount
      const x =
        stockData.position?.x ||
        Math.random() * ((paper.view?.size?.width || 800) - boxWidth);
      const y =
        stockData.position?.y ||
        Math.random() * ((paper.view?.size?.height || 600) - boxHeight);

      const isSelected = selectedBoxId === stockData.id;
      const isCircle = stockData.shape === "circle";

      let stockBox;
      if (isCircle) {
        // Create circle for infinite stocks
        const radius = Math.max(boxWidth, boxHeight) / 2;
        stockBox = new paper.Path.Circle({
          center: [x, y],
          radius: radius,
          fillColor: isSelected ? "#ffe082" : "lightgreen", // Different color for infinite stocks
          strokeColor: isSelected ? "#ff9800" : "green",
          strokeWidth: isSelected ? 3 : 2,
        });
      } else {
        // Create rectangle for finite stocks
        stockBox = new paper.Path.Rectangle({
          point: [x - boxWidth / 2, y - boxHeight / 2],
          size: [boxWidth, boxHeight],
          fillColor: isSelected ? "#ffe082" : "lightblue",
          strokeColor: isSelected ? "#ff9800" : "blue",
          strokeWidth: isSelected ? 3 : 2,
        });
      }

      const stockName = stockData.name || `Stock ${index + 1}`;
      let displayText;
      let textColor = "black";
      let fontWeight = "normal";

      // Handle infinite stocks
      if (stockData.shape === "circle") {
        displayText = `${stockName}\n∞`;
      }
      // Handle stocks with simulation amounts
      else if (stockData.simulationAmount !== undefined) {
        let simAmount;
        if (
          typeof stockData.simulationAmount === "number" &&
          !isNaN(stockData.simulationAmount)
        ) {
          simAmount = stockData.simulationAmount.toFixed(3);
        } else {
          const parsed = parseFloat(stockData.simulationAmount);
          simAmount = !isNaN(parsed) ? parsed.toFixed(3) : "0.000";
        }

        // Format overflow amount if it exists and is greater than 0
        let overflowText = "";
        if (
          stockData.overflowAmount !== undefined &&
          stockData.overflowAmount > 0
        ) {
          const overflowAmount =
            typeof stockData.overflowAmount === "number"
              ? stockData.overflowAmount.toFixed(3)
              : parseFloat(stockData.overflowAmount).toFixed(3);
          overflowText = ` (+${overflowAmount})`;
        }

        const capacityText =
          stockData.capacity > 0 ? ` / ${stockData.capacity}` : "";
        displayText = `${stockName}\n${simAmount}${overflowText} / ${stockData.amount}${capacityText}`;

        // Highlight changed amounts
        if (
          stockData.simulationAmount !== stockData.amount ||
          (stockData.overflowAmount !== undefined &&
            stockData.overflowAmount > 0)
        ) {
          textColor = "#FF6600";
          fontWeight = "bold";
        }
      }
      // Regular stocks
      else {
        const capacityText =
          stockData.capacity > 0 ? ` / ${stockData.capacity}` : "";
        displayText = `${stockName}\n${stockData.amount}${capacityText}`;
      }

      // Create text label with simulation amount
      const textLabel = new paper.PointText({
        point: [x, y - 5],
        content: displayText,
        fillColor: textColor,
        fontSize: 10,
        fontWeight: fontWeight,
        justification: "center",
      });

      const stockGroup = new paper.Group([stockBox, textLabel]);
      stockGroup.stockName = stockName;
      stockGroup.stockId = stockData.id;
      stockGroup.stockShape = stockData.shape;
      stockGroup.position = new paper.Point(x, y);

      // Add mode-based interaction logic
      let isDragging = false;
      let dragStarted = false;
      let offset = new paper.Point();

      stockGroup.onMouseDown = (event) => {
        // Use a function to get current mode to avoid closure issues
        const getCurrentMode = () => {
          const modeSelect = document.querySelector("#mode-select");
          return modeSelect ? modeSelect.value : "normal";
        };
        if (getCurrentMode() === "connect") {
          // Disable dragging in connect mode
          return;
        }
        isDragging = true;
        dragStarted = false;
        offset = stockGroup.position.subtract(event.point);
        // Ensure selection is set on drag start
        setSelectedItem({ ...stockData, type: "stock" });
        setEditingItem({ ...stockData, type: "stock" });
        setSelectedBoxId(stockData.id);
      };

      stockGroup.onMouseDrag = (event) => {
        // Use a function to get current mode to avoid closure issues
        const getCurrentMode = () => {
          const modeSelect = document.querySelector("#mode-select");
          return modeSelect ? modeSelect.value : "normal";
        };
        if (getCurrentMode() === "connect") {
          // Disable dragging in connect mode
          return;
        }
        if (isDragging) {
          dragStarted = true;
          stockGroup.position = event.point.add(offset);
          const boxIndex = newBoxes.findIndex((b) => b === stockGroup);
          updateConnectionsOnDrag(stockGroup, boxIndex);
        }
      };

      stockGroup.onMouseUp = (event) => {
        // Use a function to get current mode to avoid closure issues
        const getCurrentMode = () => {
          const modeSelect = document.querySelector("#mode-select");
          return modeSelect ? modeSelect.value : "normal";
        };
        if (getCurrentMode() === "connect") {
          // Connection logic is now handled by canvas hit testing
          return;
        }

        isDragging = false;

        if (!dragStarted) {
          // This was a click, not a drag - handle selection
          setSelectedItem({ ...stockData, type: "stock" });
          setEditingItem({ ...stockData, type: "stock" });
          setSelectedBoxId(stockData.id);
        } else {
          // This was a drag - keep selection after drag
          setSelectedItem({ ...stockData, type: "stock" });
          setEditingItem({ ...stockData, type: "stock" });
          setSelectedBoxId(stockData.id);
        }

        dragStarted = false;
      };

      newBoxes.push(stockGroup);
    });

    // Create feedback loops from JSON data
    if (jsonData.connections) {
      jsonData.connections.forEach((connData) => {
        // Skip rendering if filter is enabled and this connection is not visible
        if (currentMode === "edit" && editModeFilterEnabled && selectedItem && !visibleElements.connections.has(connData.id)) {
          return;
        }
        
        const fromStock = newBoxes.find(
          (box) => box.stockId === connData.fromStockId
        );
        const toStock = newBoxes.find(
          (box) => box.stockId === connData.toStockId
        );
        if (fromStock && toStock) {
          const connection = createConnection(fromStock, toStock, connData);
          newConnections.push(connection);
        }
      });
    }

    // Update state
    setBoxes(newBoxes);
    setConnections(newConnections);
    paperState.current.boxes = newBoxes;
    paperState.current.connections = newConnections;

    // Redraw axes and view
    drawAxes();
    if (paper.view) paper.view.draw();
  }, [jsonData?.boxes, selectedBoxId, currentMode, editModeFilterEnabled, selectedItem]);

  // Handle connections changes separately to avoid recreating boxes
  useEffect(() => {
    if (!jsonData || !jsonData.connections || !paperState.current.boxes) return;

    // Remove existing connections
    paperState.current.connections.forEach((conn) => {
      if (conn && conn.remove) {
        conn.remove();
      }
    });
    paperState.current.connections = [];

    // Apply filter if edit mode filter is enabled
    let visibleElements = { stocks: new Set(), connections: new Set() };
    if (currentMode === "edit" && editModeFilterEnabled && selectedItem) {
      visibleElements = getConnectedElements(selectedItem);
    }

    // Recreate connections
    const newConnections = [];
    jsonData.connections.forEach((connData) => {
      // Skip rendering if filter is enabled and this connection is not visible
      if (currentMode === "edit" && editModeFilterEnabled && selectedItem && !visibleElements.connections.has(connData.id)) {
        return;
      }
      
      const fromStock = paperState.current.boxes.find(
        (box) => box.stockId === connData.fromStockId
      );
      const toStock = paperState.current.boxes.find(
        (box) => box.stockId === connData.toStockId
      );
      if (fromStock && toStock) {
        // Always use fromStock as the first argument, toStock as the second
        const connection = createConnection(fromStock, toStock, connData);
        newConnections.push(connection);
      }
    });

    paperState.current.connections = newConnections;
    setConnections(newConnections);
    if (paper.view) paper.view.draw();
  }, [jsonData?.connections, currentMode, editModeFilterEnabled, selectedItem]);

  // Keep editor value in sync with jsonData
  useEffect(() => {
    console.log("jsonData changed, updating editor value");
    setEditorValue(JSON.stringify(jsonData, null, 2));
  }, [jsonData]);

  // Handle JSON editor visibility changes without clearing canvas
  useEffect(() => {
    // This effect runs after the DOM has been updated
    // We need to make sure the canvas is properly sized after toggling
    if (resizeCanvasRef.current) {
      // Use setTimeout to ensure this runs after the DOM update is complete
      setTimeout(() => {
        resizeCanvasRef.current();
        // Redraw the canvas with the current data
        drawAxes();
        if (paper.view) paper.view.draw();
      }, 0);
    }
  }, [jsonEditorVisible]);


  
  // Function to get directly connected elements for filtering
  const getConnectedElements = (selectedItem) => {
    if (!selectedItem || !jsonData) return { stocks: new Set(), connections: new Set() };
    
    const visibleStocks = new Set();
    const visibleConnections = new Set();
    
    if (selectedItem.type === "stock") {
      // Add the selected stock itself
      visibleStocks.add(selectedItem.id);
      
      // Find only connections directly involving this stock
      jsonData.connections?.forEach(conn => {
        if (conn.fromStockId === selectedItem.id || conn.toStockId === selectedItem.id) {
          // Add the connection
          visibleConnections.add(conn.id);
          // Add only the other stock that is connected through this specific connection
          if (conn.fromStockId === selectedItem.id) {
            visibleStocks.add(conn.toStockId);
          } else {
            visibleStocks.add(conn.fromStockId);
          }
        }
      });
    } else if (selectedItem.type === "connection") {
      // Add the selected connection itself
      visibleConnections.add(selectedItem.id);
      // Add only the two stocks that are endpoints of this connection
      visibleStocks.add(selectedItem.fromStockId);
      visibleStocks.add(selectedItem.toStockId);
    }
    
    return { stocks: visibleStocks, connections: visibleConnections };
  };

  const addBoxWithNameAndAmount = (name, amount, shape = "rectangle") => {
    // Set pending stock data and enable add mode
    setPendingStockData({ name, amount, shape });
    setCurrentMode("add");
    // No alert - we'll use a custom cursor instead
  };

  const placeStockAtPosition = (x, y) => {
    if (!pendingStockData) return;

    // Generate a unique stock ID
    const newId = getNextUniqueId();
    const newStock = {
      id: newId,
      name: pendingStockData.name,
      type: "stock",
      shape: pendingStockData.shape || "rectangle",
      amount:
        pendingStockData.shape === "circle" ? "∞" : pendingStockData.amount,
      position: {
        x: x,
        y: y,
      },
    };
    setJsonData((prev) => ({
      ...prev,
      boxes: [...prev.boxes, newStock],
    }));

    // Reset pending state and return to normal mode
    setPendingStockData(null);
    setCurrentMode("normal");
  };

  // Helper function to calculate edge intersection point
  const getEdgePoint = (fromBox, toBox) => {
    const fromCenter = fromBox.bounds.center;
    const toCenter = toBox.bounds.center;
    const direction = toCenter.subtract(fromCenter).normalize();

    // Calculate intersection with the edge of the target box
    const toBounds = toBox.bounds;
    const halfWidth = toBounds.width / 2;
    const halfHeight = toBounds.height / 2;

    // Determine which edge the line intersects
    const absX = Math.abs(direction.x);
    const absY = Math.abs(direction.y);

    let edgePoint;
    if (absX / halfWidth > absY / halfHeight) {
      // Intersects left or right edge
      const x = toCenter.x + (direction.x > 0 ? -halfWidth : halfWidth);
      const y = toCenter.y - (direction.y * halfWidth) / absX;
      edgePoint = new paper.Point(x, y);
    } else {
      // Intersects top or bottom edge
      const x = toCenter.x - (direction.x * halfHeight) / absY;
      const y = toCenter.y + (direction.y > 0 ? -halfHeight : halfHeight);
      edgePoint = new paper.Point(x, y);
    }

    return edgePoint;
  };

  const createSelfConnection = (box, connectionData = null) => {
    const boxBounds = box.bounds;
    const boxCenter = box.position;
    const loopRadius = 150; // Radius of the self-connection loop
    const arrowSize = 8;

    // Position the loop on the right side of the box
    const startPoint = new paper.Point(boxBounds.right, boxCenter.y);
    const endPoint = new paper.Point(boxBounds.right, boxCenter.y - 5); // Slightly offset for arrow

    // Create control points for a circular loop
    const controlOffset = loopRadius;
    const control1 = new paper.Point(
      boxBounds.right + controlOffset,
      boxCenter.y - controlOffset
    );
    const control2 = new paper.Point(
      boxBounds.right + controlOffset,
      boxCenter.y + controlOffset
    );

    // Determine connection style based on connection type
    const isOverflow = connectionData && connectionData.isOverflow;

    // Create the curved path
    const path = new paper.Path({
      strokeColor: isOverflow ? "blue" : "black", // Blue for overflow connections
      strokeWidth: isOverflow ? 3 : 2, // Thicker line for overflow connections
      dashArray: isOverflow ? [4, 2] : null, // Dashed line for overflow connections
    });

    path.moveTo(startPoint);
    path.cubicCurveTo(control1, control2, endPoint);

    // Create arrow at the end point
    const arrowDirection = new paper.Point(-1, 0); // Pointing left into the box
    const perpendicular = new paper.Point(0, -1); // Perpendicular for arrow wings

    const arrowTip = endPoint;
    const arrowBase = arrowTip.subtract(arrowDirection.multiply(arrowSize));
    const arrowLeft = arrowBase.add(perpendicular.multiply(arrowSize / 2));
    const arrowRight = arrowBase.subtract(
      perpendicular.multiply(arrowSize / 2)
    );

    const arrowHead = new paper.Path({
      segments: [arrowTip, arrowLeft, arrowRight],
      strokeColor: isOverflow ? "blue" : "black", // Match path color
      strokeWidth: 2,
      fillColor: isOverflow ? "blue" : "black", // Match path color
      closed: true,
    });

    // Add connection name label if provided
    let nameLabel = null;
    let labelHitBox = null;
    let orderCircle = null;

    if (connectionData && connectionData.name) {
      const labelPosition = new paper.Point(
        boxBounds.right + loopRadius,
        boxCenter.y
      );
      let displayText = connectionData.name;

      // Default values if not specified - support both numeric and percentage values
      const amount =
        connectionData.amount !== undefined ? connectionData.amount : 1;

      // Always show both amounts in the label
      if (connectionData.isOverflow) {
        displayText = `${connectionData.name} (overflow)`;
      } else {
        displayText = `${connectionData.name} (${amount})`;
      }
      nameLabel = new paper.PointText({
        point: labelPosition,
        content: displayText,
        fillColor: "black",
        fontSize: 12,
        justification: "center",
      });

      // Create a dotted bounding box around the text for better hit testing
      const textBounds = nameLabel.bounds;
      const padding = 4; // Add some padding around the text
      labelHitBox = new paper.Path.Rectangle({
        rectangle: new paper.Rectangle(
          textBounds.x - padding,
          textBounds.y - padding,
          textBounds.width + padding * 2,
          textBounds.height + padding * 2
        ),
        strokeColor: "#cccccc", // Light gray dotted border
        strokeWidth: 1,
        dashArray: [2, 2],
        fillColor: "transparent",
      });
    }

    // Add click handler for self-connection selection
    const handleSelfConnectionSelect = (event) => {
      // Use a function to get current mode to avoid closure issues
      const getCurrentMode = () => {
        const modeSelect = document.querySelector("#mode-select");
        return modeSelect ? modeSelect.value : "normal";
      };
      console.log("Self-connection clicked, current mode:", getCurrentMode());
      if (getCurrentMode() === "edit") {
        // Use Paper.js hit testing with tolerance for better accuracy
        const hitPoint = event.point || (event.event && event.event.point);
        if (hitPoint) {
          const hitResult = path.hitTest(hitPoint, {
            stroke: true,
            tolerance: 10, // Increase tolerance for easier clicking
          });
          if (hitResult || path.bounds.contains(hitPoint)) {
            // Get connectionData from the group that will be created
            const groupConnectionData =
              event.target.parent?.connectionData || connectionData;
            console.log(
              "Self-connection groupConnectionData:",
              groupConnectionData
            );
            console.log(
              "Self-connection connectionData fallback:",
              connectionData
            );
            if (groupConnectionData) {
              // Ensure amount is defined with a default if missing
              const enhancedData = {
                ...groupConnectionData,
                type: "connection",
                amount:
                  groupConnectionData.amount !== undefined
                    ? groupConnectionData.amount
                    : 1,
              };
              console.log(
                "Selected self-connection with enhanced data:",
                enhancedData
              );
              setSelectedItem(enhancedData);
              setEditingItem(enhancedData);
            } else {
              setSelectedItem(null);
              setEditingItem(null);
            }
            setSelectedBoxId(null);
          }
        }
      }
    };

    // Simplified handler for direct clicks on arrow and labels
    const handleDirectSelect = (event) => {
      // Use a function to get current mode to avoid closure issues
      const getCurrentMode = () => {
        const modeSelect = document.querySelector("#mode-select");
        return modeSelect ? modeSelect.value : "normal";
      };
      if (getCurrentMode() === "edit") {
        // Get connectionData from the group
        const groupConnectionData =
          event.target.parent?.connectionData || connectionData;
        if (groupConnectionData) {
          // Ensure amount is defined with defaults if missing
          const enhancedData = {
            ...groupConnectionData,
            type: "connection",
            amount:
              groupConnectionData.amount !== undefined
                ? groupConnectionData.amount
                : 1,
            transferAmount:
              groupConnectionData.transferAmount !== undefined
                ? groupConnectionData.transferAmount
                : 1,
          };
          console.log("Selected connection with enhanced data:", enhancedData);
          setSelectedItem(enhancedData);
          setEditingItem(enhancedData);
        } else {
          setSelectedItem(null);
          setEditingItem(null);
        }
        setSelectedBoxId(null);
      }
    };

    path.onMouseDown = handleSelfConnectionSelect;
    arrowHead.onMouseDown = handleDirectSelect;
    if (nameLabel) {
      nameLabel.onMouseDown = handleDirectSelect;
    }
    if (labelHitBox) {
      labelHitBox.onMouseDown = handleDirectSelect;
    }

    // Add order number in a circle
    if (connectionData && connectionData.order !== undefined) {
      // Position the order circle near the loop
      const circlePosition = new paper.Point(
        boxBounds.right + loopRadius / 2,
        boxCenter.y - loopRadius / 2
      );

      // Create the circle
      const circleRadius = 12;
      const circle = new paper.Path.Circle({
        center: circlePosition,
        radius: circleRadius,
        fillColor: isOverflow ? "lightblue" : "lightgray",
        strokeColor: isOverflow ? "blue" : "black",
        strokeWidth: 1,
      });

      // Add the order number text
      const orderText = new paper.PointText({
        point: circlePosition,
        content: connectionData.order.toString(),
        fillColor: "black",
        fontSize: 10,
        justification: "center",
        fontWeight: "bold",
      });

      // Center the text vertically
      orderText.position.y += 3;

      // Group the circle and text
      orderCircle = new paper.Group([circle, orderText]);
      orderCircle.onMouseDown = handleDirectSelect;
    }

    // Create the connection group with all elements
    const connectionGroup = new paper.Group([path, arrowHead]);

    // Add optional elements if they exist
    if (nameLabel) connectionGroup.addChild(nameLabel);
    if (labelHitBox) connectionGroup.addChild(labelHitBox);
    if (orderCircle) connectionGroup.addChild(orderCircle);

    if (connectionData) {
      connectionGroup.connectionData = connectionData;
    }

    // Add group handler for fallback
    connectionGroup.onMouseDown = handleSelfConnectionSelect;

    return connectionGroup;
  };

  const createConnection = (box1, box2, connectionData = null) => {
    // Check if this is a self-connection
    const isSelfConnection = box1.stockId === box2.stockId;

    if (isSelfConnection) {
      return createSelfConnection(box1, connectionData);
    }

    const end = getEdgePoint(box1, box2); // from box1 (from) to box2 (to)
    const start = getEdgePoint(box2, box1); // to box2 (to) from box1 (from)

    const arrowSize = 8;
    // Calculate direction and snap to nearest axis (horizontal or vertical only)
    const rawDirection = end.subtract(start);

    let direction;
    if (Math.abs(rawDirection.x) > Math.abs(rawDirection.y)) {
      // Horizontal direction
      direction = new paper.Point(rawDirection.x > 0 ? 1 : -1, 0);
    } else {
      // Vertical direction
      direction = new paper.Point(0, rawDirection.y > 0 ? 1 : -1);
    }
    const perpendicular = new paper.Point(-direction.y, direction.x);
    // Calculate the base of the arrowhead
    const arrowBase = end.subtract(direction.multiply(arrowSize));
    const arrowLeft = arrowBase.add(perpendicular.multiply(arrowSize / 2));
    const arrowRight = arrowBase.subtract(
      perpendicular.multiply(arrowSize / 2)
    );
    // The curve should end at the base of the arrow, not the box
    // Handle calculations should follow the arrow direction
    let handle1, handle2;
    if (Math.abs(direction.x) > 0) {
      // Horizontal arrow - curve should be vertical
      handle1 = new paper.Point((start.x + arrowBase.x) / 2, start.y);
      handle2 = new paper.Point((start.x + arrowBase.x) / 2, arrowBase.y);
    } else {
      // Vertical arrow - curve should be horizontal
      handle1 = new paper.Point(start.x, (start.y + arrowBase.y) / 2);
      handle2 = new paper.Point(arrowBase.x, (start.y + arrowBase.y) / 2);
    }
    // Determine connection style based on connection type
    const isOverflow = connectionData && connectionData.isOverflow;

    const path = new paper.Path({
      segments: [new paper.Segment(start), new paper.Segment(arrowBase)],
      strokeColor: isOverflow ? "blue" : "black", // Blue for overflow connections
      strokeWidth: isOverflow ? 3 : 2, // Thicker line for overflow connections
      dashArray: isOverflow ? [4, 2] : null, // Dashed line for overflow connections
    });
    path.segments[0].handleOut = handle1.subtract(start);
    path.segments[1].handleIn = handle2.subtract(arrowBase);
    // Arrow always on 'to' side (end) - directional based on connection
    const arrowTip = end;
    const arrowHead = new paper.Path({
      segments: [arrowTip, arrowLeft, arrowRight],
      strokeColor: isOverflow ? "blue" : "black", // Match path color
      strokeWidth: 2,
      fillColor: isOverflow ? "blue" : "black", // Match path color
      closed: true,
    });
    // Add feedback loop name label if connection data is provided
    let nameLabel = null;
    let labelHitBox = null;
    let orderCircle = null;

    if (connectionData && connectionData.name) {
      const midPoint = start.add(arrowBase).divide(2);
      let displayText = connectionData.name;

      // Default values if not specified
      const amount =
        connectionData.amount !== undefined ? connectionData.amount : 1;

      // Find the source and target stocks to check if they're infinite
      const fromStockId = connectionData.fromStockId;
      const toStockId = connectionData.toStockId;

      // Find the stock data from jsonData
      const fromStock = jsonData.boxes.find((box) => box.id === fromStockId);
      const toStock = jsonData.boxes.find((box) => box.id === toStockId);

      const isFromInfinite = fromStock && fromStock.shape === "circle";
      const isToInfinite = toStock && toStock.shape === "circle";

      displayText = `${connectionData.name} (${amount})`;

      nameLabel = new paper.PointText({
        point: midPoint.add(new paper.Point(0, -10)),
        content: displayText,
        fillColor: "black",
        fontSize: 12,
        justification: "center",
      });

      // Create a dotted bounding box around the text for better hit testing
      const textBounds = nameLabel.bounds;
      const padding = 4; // Add some padding around the text
      labelHitBox = new paper.Path.Rectangle({
        rectangle: new paper.Rectangle(
          textBounds.x - padding,
          textBounds.y - padding,
          textBounds.width + padding * 2,
          textBounds.height + padding * 2
        ),
        strokeColor: "#cccccc", // Light gray dotted border
        strokeWidth: 1,
        dashArray: [2, 2],
        fillColor: "transparent",
      });
    }
    // Add click handler for connection selection to all relevant items
    const handleConnectionSelect = (event) => {
      // Use a function to get current mode to avoid closure issues
      const getCurrentMode = () => {
        const modeSelect = document.querySelector("#mode-select");
        return modeSelect ? modeSelect.value : "normal";
      };
      if (getCurrentMode() === "edit") {
        // Use Paper.js hit testing with tolerance for better accuracy
        const hitPoint = event.point || (event.event && event.event.point);
        if (hitPoint) {
          const hitResult = path.hitTest(hitPoint, {
            stroke: true,
            tolerance: 10, // Increase tolerance for easier clicking
          });
          if (hitResult || path.bounds.contains(hitPoint)) {
            // Get connectionData from the group that will be created
            const groupConnectionData =
              event.target.parent?.connectionData || connectionData;

            if (groupConnectionData) {
              // Ensure amount has a default value if missing
              const amount =
                groupConnectionData.amount !== undefined
                  ? groupConnectionData.amount
                  : 1;

              // Create a properly initialized selection object
              const selectionData = {
                ...groupConnectionData,
                type: "connection",
                amount: amount,
              };

              console.log(
                "Selected connection with initialized values:",
                selectionData
              );

              setSelectedItem(selectionData);
              setEditingItem(selectionData);
              setSelectedBoxId(null);
            }
          }
        }
      }
    };
    // Simplified handler for direct clicks on arrow and labels
    const handleDirectSelect = (event) => {
      if (currentMode === "edit") {
        // Get connectionData from the group
        const groupConnectionData =
          event.target.parent?.connectionData || connectionData;

        if (groupConnectionData) {
          // Ensure amount has default values if missing
          // Preserve string format for percentage values
          const amount =
            groupConnectionData.amount !== undefined
              ? groupConnectionData.amount
              : 1;

          const transferAmount =
            groupConnectionData.transferAmount !== undefined
              ? groupConnectionData.transferAmount
              : 1;

          // Create a properly initialized selection object
          const selectionData = {
            ...groupConnectionData,
            type: "connection",
            amount: amount,
            transferAmount: transferAmount,
          };

          console.log(
            "Direct selected connection with initialized values:",
            selectionData
          );

          setSelectedItem(selectionData);
          setEditingItem(selectionData);
          setSelectedBoxId(null);
        }
      }
    };

    path.onMouseDown = handleConnectionSelect;
    arrowHead.onMouseDown = handleDirectSelect;
    if (nameLabel) {
      nameLabel.onMouseDown = handleDirectSelect;
    }
    if (labelHitBox) {
      labelHitBox.onMouseDown = handleDirectSelect;
    }

    // Add order number in a circle
    if (connectionData && connectionData.order !== undefined) {
      // Position the order circle near the middle of the connection but offset to avoid overlap
      const circlePosition = start
        .add(arrowBase)
        .divide(2)
        .add(new paper.Point(15, 15));

      // Create the circle
      const circleRadius = 12;
      const circle = new paper.Path.Circle({
        center: circlePosition,
        radius: circleRadius,
        fillColor: isOverflow ? "lightblue" : "lightgray",
        strokeColor: isOverflow ? "blue" : "black",
        strokeWidth: 1,
      });

      // Add the order number text
      const orderText = new paper.PointText({
        point: circlePosition,
        content: connectionData.order.toString(),
        fillColor: "black",
        fontSize: 10,
        justification: "center",
        fontWeight: "bold",
      });

      // Center the text vertically
      orderText.position.y += 3;

      // Group the circle and text
      orderCircle = new paper.Group([circle, orderText]);
      orderCircle.onMouseDown = handleDirectSelect;
    }

    // Create the connection group with all elements
    const connectionGroup = new paper.Group([path, arrowHead]);

    // Add optional elements if they exist
    if (nameLabel) connectionGroup.addChild(nameLabel);
    if (labelHitBox) connectionGroup.addChild(labelHitBox);
    if (orderCircle) connectionGroup.addChild(orderCircle);
    if (connectionData) {
      connectionGroup.connectionData = connectionData;
    }
    // Optionally, keep group handler for fallback
    connectionGroup.onMouseDown = handleConnectionSelect;
    return connectionGroup;
  };

  const refreshConnections = (updatedJsonData) => {
    console.log("refreshConnections called with data:", updatedJsonData);

    // Remove existing connections
    paperState.current.connections.forEach((conn) => conn.remove());
    const newConnections = [];

    // Recreate connections with updated data
    if (updatedJsonData.connections) {
      console.log(
        "Processing",
        updatedJsonData.connections.length,
        "connections"
      );
      updatedJsonData.connections.forEach((connData) => {
        console.log("Creating connection:", connData);
        const fromStock = paperState.current.boxes.find(
          (box) => box.stockId === connData.fromStockId
        );
        const toStock = paperState.current.boxes.find(
          (box) => box.stockId === connData.toStockId
        );

        if (fromStock && toStock) {
          console.log(
            `Found stock objects - from: ${connData.fromStockId}, to: ${connData.toStockId}`
          );
          const connection = createConnection(fromStock, toStock, connData);
          newConnections.push(connection);
        } else {
          console.warn(
            `Could not find stock objects for connection - from: ${connData.fromStockId}, to: ${connData.toStockId}`
          );
        }
      });
    }

    console.log("Created", newConnections.length, "new connections");
    paperState.current.connections = newConnections;
    setConnections(newConnections);
    if (paper.view) {
      console.log("Drawing paper view");
      paper.view.draw();
    } else {
      console.warn("paper.view is not available");
    }
  };

  const runSimulation = () => {
    if (!jsonData || !jsonData.connections || !jsonData.boxes) return;

    // Create a copy of the current stock amounts
    // Use amount as original, simulationAmount for simulation values
    const updatedBoxes = jsonData.boxes.map((box) => {
      console.log(`Processing box ${box.name} for simulation:`, {
        id: box.id,
        amount: box.amount,
        simulationAmount: box.simulationAmount,
      });

      return {
        ...box,
        simulationAmount:
          box.simulationAmount !== undefined
            ? box.simulationAmount
            : box.amount, // Initialize simulation amount if needed
      };
    });

    // Sort connections by order field to determine processing sequence
    // This replaces the previous complex sorting logic
    const orderedConnections = [...jsonData.connections].sort((a, b) => {
      // Sort by order field (smaller order first)
      // If order is not defined, fall back to ID for backward compatibility
      const orderA = a.order !== undefined ? a.order : a.id;
      const orderB = b.order !== undefined ? b.order : b.id;
      return orderA - orderB;
    });

    // Log the ordered connections for debugging
    console.log(
      "Processing connections in order based on 'order' field:",
      orderedConnections.map((conn) => ({
        id: conn.id,
        name: conn.name,
        order: conn.order !== undefined ? conn.order : conn.id,
      }))
    );

    // Log the ordered connections for debugging
    console.log(
      "Processing connections in the following order:",
      orderedConnections.map((conn) => ({ id: conn.id, name: conn.name }))
    );

    // Process each connection in the ordered sequence
    orderedConnections.forEach((connection) => {
      const fromStock = updatedBoxes.find(
        (box) => box.id === connection.fromStockId
      );
      const toStock = updatedBoxes.find(
        (box) => box.id === connection.toStockId
      );

      // Check if this is a self-connection
      const isSelfConnection = connection.fromStockId === connection.toStockId;
      console.log(
        `Processing connection ${connection.name} (ID: ${connection.id})`,
        {
          fromId: connection.fromStockId,
          toId: connection.toStockId,
          isSelfConnection,
          amount: connection.amount,
        }
      );

      // Preserve the original format (number or percentage string)
      const amountRaw =
        connection.amount !== undefined && connection.amount !== null
          ? connection.amount
          : 1;

      if (fromStock && toStock) {
        // Special handling for self-connections
        if (connection.fromStockId === connection.toStockId) {
          let actualAmount = 0;
          if (typeof amountRaw === "string" && amountRaw.includes("%")) {
            const percentageStr = amountRaw.replace("%", "").trim();
            const parsedPercentage = parseFloat(percentageStr);
            if (isNaN(parsedPercentage)) {
              console.warn(
                `Invalid percentage value: ${amountRaw}, defaulting to 0`
              );
              actualAmount = 0;
            } else {
              const percentage = parsedPercentage / 100;
              if (fromStock.shape !== "circle") {
                actualAmount = fromStock.simulationAmount * percentage;
              } else {
                // For infinite stock, percentage is treated as fixed value
                actualAmount = parsedPercentage;
              }
            }
          } else {
            const parsedNumber = Number(amountRaw);
            actualAmount = isNaN(parsedNumber) ? 0 : parsedNumber;
          }

          const currentAmount =
            typeof fromStock.simulationAmount === "number" &&
            !isNaN(fromStock.simulationAmount)
              ? fromStock.simulationAmount
              : (function () {
                  const parsed = parseFloat(fromStock.simulationAmount);
                  return !isNaN(parsed) ? parsed : 0;
                })();
          // Calculate new amount but ensure it doesn't exceed capacity
          const newAmount =
            currentAmount + (isNaN(actualAmount) ? 0 : actualAmount);
          const capacity =
            fromStock.capacity > 0 ? fromStock.capacity : Infinity;
          let overflow = 0;
          if (newAmount > capacity && capacity !== Infinity) {
            overflow = newAmount - capacity;
            fromStock.overflowAmount =
              (fromStock.overflowAmount || 0) + overflow;
            console.log(
              `Self-connection: Stock ${fromStock.name} reached capacity limit of ${capacity}. Excess amount ${overflow} added to overflowAmount.`
            );
          }
          fromStock.simulationAmount = Math.min(
            Math.max(0, newAmount),
            capacity
          );
          console.log(
            `Self-connection on ${fromStock.name}: Added ${actualAmount}, New amount: ${fromStock.simulationAmount}`
          );
        } else {
          // Normal connection processing (source and destination are different)
          const isFromInfinite = fromStock.shape === "circle";
          const isToInfinite = toStock.shape === "circle";

          let actualAmount = 0;
          if (typeof amountRaw === "string" && amountRaw.includes("%")) {
            const percentageStr = amountRaw.replace("%", "").trim();
            const parsedPercentage = parseFloat(percentageStr);
            if (isNaN(parsedPercentage)) {
              console.warn(
                `Invalid percentage value: ${amountRaw}, defaulting to 0`
              );
              actualAmount = 0;
            } else {
              const percentage = parsedPercentage / 100;
              if (isFromInfinite) {
                actualAmount = parsedPercentage;
              } else {
                actualAmount = fromStock.simulationAmount * percentage;
              }
            }
          } else {
            const parsedNumber = Number(amountRaw);
            actualAmount = isNaN(parsedNumber) ? 0 : parsedNumber;
          }

          if (!isFromInfinite) {
            const isAmountZero =
              (typeof amountRaw === "string" &&
                amountRaw.replace("%", "").trim() === "0") ||
              Number(amountRaw) === 0;
            if (!isAmountZero) {
              const currentAmount =
                typeof fromStock.simulationAmount === "number" &&
                !isNaN(fromStock.simulationAmount)
                  ? fromStock.simulationAmount
                  : (function () {
                      const parsed = parseFloat(fromStock.simulationAmount);
                      return !isNaN(parsed) ? parsed : 0;
                    })();

              if (currentAmount < actualAmount) {
                actualAmount = Math.max(0, currentAmount);
                console.log(
                  `Insufficient amount in ${fromStock.name}. Limited amount to ${actualAmount}`
                );
              }

              if (actualAmount <= 0) {
                console.log(
                  `Connection from ${fromStock.name} to ${toStock.name} is inactive - no amount`
                );
                return;
              }
            }
          }

          let amountToAdd = actualAmount;

          if (!isToInfinite) {
            const currentToAmount =
              typeof toStock.simulationAmount === "number" &&
              !isNaN(toStock.simulationAmount)
                ? toStock.simulationAmount
                : (function () {
                    const parsed = parseFloat(toStock.simulationAmount);
                    return !isNaN(parsed) ? parsed : 0;
                  })();

            const capacity = toStock.capacity > 0 ? toStock.capacity : Infinity;
            const remainingCapacity = capacity - currentToAmount;

            // Handle overflow connections differently
            // Overflow connections transfer excess amount beyond a stock's capacity
            // The full overflow amount is always deducted from the source stock
            // The target stock will receive as much as its capacity allows
            // Note: A connection can only be either an overflow connection or have an amount, not both.
            // For overflow connections, we ignore any amount value and transfer the full overflow amount.
            if (connection.isOverflow) {
              // For overflow connections, we don't limit by remaining capacity
              // The amount is determined by the source stock's overflow beyond capacity
              if (fromStock && fromStock.capacity > 0) {
                const fromCapacity = fromStock.capacity;
                const currentFromAmount =
                  typeof fromStock.simulationAmount === "number" &&
                  !isNaN(fromStock.simulationAmount)
                    ? fromStock.simulationAmount
                    : (function () {
                        const parsed = parseFloat(fromStock.simulationAmount);
                        return !isNaN(parsed) ? parsed : 0;
                      })();

                // Calculate overflow amount (amount beyond capacity)
                const overflowAmount = fromStock.overflowAmount || 0;

                if (overflowAmount > 0) {
                  // For self-connections, transfer all overflow amount (acts as a buffer)
                  // Self-connections with overflow type will always transfer 100% of the overflow
                  // This allows stocks to have a buffer that stores overflow and transfers it all
                  if (isSelfConnection) {
                    console.log(
                      `Self-connection overflow: Transferring all overflow amount ${overflowAmount}`
                    );
                    actualAmount = overflowAmount;
                  } else {
                    // For overflow connections, we transfer the full overflow amount
                    // Since a connection can only be either an overflow connection or have an amount (not both),
                    // we ignore any amount value for overflow connections
                    actualAmount = overflowAmount;
                  }
                } else {
                  console.log(
                    `No overflow in ${fromStock.name}, skipping overflow connection`
                  );
                  return; // No overflow, skip this connection
                }
              }
            } else {
              // Regular connection behavior
              if (remainingCapacity <= 0) {
                console.log(`Stock ${toStock.name} is full, no amount added.`);
                return; // Stop processing this connection
              }
            }

            // For regular connections, limit by remaining capacity
            // For overflow connections, we transfer the full amount without limiting by remaining capacity
            // This ensures all overflow is transferred to the target stock
            if (connection.isOverflow) {
              // For overflow connections, we set amountToAdd to actualAmount
              // actualAmount is already set to overflowAmount for overflow connections
              // This ensures the full overflow amount is transferred to the target stock
              amountToAdd = actualAmount;
            } else {
              // Regular connections still respect the target's capacity
              amountToAdd = Math.min(actualAmount, remainingCapacity);
            }
          }

          if (!isFromInfinite) {
            const currentFromAmount =
              typeof fromStock.simulationAmount === "number" &&
              !isNaN(fromStock.simulationAmount)
                ? fromStock.simulationAmount
                : (function () {
                    const parsed = parseFloat(fromStock.simulationAmount);
                    return !isNaN(parsed) ? parsed : 0;
                  })();

            // For overflow connections, handle deduction differently
            if (connection.isOverflow) {
              // First check if there's any existing overflowAmount to transfer
              if (fromStock.overflowAmount && fromStock.overflowAmount > 0) {
                // Get the existing overflow amount
                const existingOverflow = fromStock.overflowAmount;

                // Set the amount to add to the target
                amountToAdd = existingOverflow;

                console.log(
                  `Overflow connection: Transferring existing overflow amount ${existingOverflow} from ${fromStock.name}`
                );
                // Always reset the source's overflowAmount after transfer
                fromStock.overflowAmount = 0;
              }
              // Also check for overflow beyond capacity in simulationAmount
              else if (fromStock.capacity > 0) {
                // For overflow connections, we deduct the overflow amount
                // Calculate how much to deduct (the overflow amount)
                const fromCapacity = fromStock.capacity;
                const overflowAmount = Math.max(
                  0,
                  currentFromAmount - fromCapacity
                );

                // For overflow connections, we always deduct the full overflow amount
                // This ensures all overflow is removed from the source stock
                const amountToDeduct = overflowAmount;

                // Deduct the overflow amount from the source stock
                fromStock.simulationAmount = Math.max(
                  0,
                  currentFromAmount -
                    (isNaN(amountToDeduct) ? 0 : amountToDeduct)
                );

                console.log(
                  `Overflow connection${
                    isSelfConnection ? " (self)" : ""
                  }: Deducted ${amountToDeduct} from ${
                    fromStock.name
                  }, new amount: ${fromStock.simulationAmount}`
                );

                // The amount to add to the target is the full overflow amount
                // Note: The target's capacity will still be respected when actually adding
                // We don't need to reassign amountToAdd here as it's already set to actualAmount earlier
                // and actualAmount is already set to overflowAmount for overflow connections
                // This ensures the full overflow amount is transferred to the target stock
              }
            } else {
              // Regular connection behavior
              const amountToDeduct = Math.min(currentFromAmount, amountToAdd);

              fromStock.simulationAmount = Math.max(
                0,
                currentFromAmount - (isNaN(amountToDeduct) ? 0 : amountToDeduct)
              );
              console.log(
                `Deducted ${amountToDeduct} from ${fromStock.name}, new amount: ${fromStock.simulationAmount}`
              );
              // For regular connections, the actual amount added cannot exceed what was deducted
              // This ensures consistency between what's deducted from the source and what's added to the target
              amountToAdd = amountToDeduct;
            }
          }

          if (!isToInfinite) {
            const currentToAmount =
              typeof toStock.simulationAmount === "number" &&
              !isNaN(toStock.simulationAmount)
                ? toStock.simulationAmount
                : (function () {
                    const parsed = parseFloat(toStock.simulationAmount);
                    return !isNaN(parsed) ? parsed : 0;
                  })();
            // Calculate new amount but ensure it doesn't exceed capacity
            const newAmount =
              currentToAmount + (isNaN(amountToAdd) ? 0 : amountToAdd);
            const capacity = toStock.capacity > 0 ? toStock.capacity : Infinity;

            // For overflow connections, we need to handle excess differently
            if (connection.isOverflow) {
              // For overflow connections, we DO NOT respect the capacity limit
              // The full overflow amount is added to the target stock

              // Calculate how much exceeds capacity
              if (newAmount > capacity && capacity !== Infinity) {
                // Track the overflow amount separately for this connection
                const excessAmount = newAmount - capacity;
                toStock.overflowAmount =
                  (toStock.overflowAmount || 0) + excessAmount;
                // Set simulation amount to capacity
                toStock.simulationAmount = capacity;
                console.log(
                  `Overflow connection: Added ${amountToAdd} to ${toStock.name}. ` +
                    `${excessAmount} exceeds capacity and is tracked as overflow.`
                );
                console.log(
                  `Note: ${toStock.name} now has overflow amount of ${toStock.overflowAmount}`
                );
              } else {
                // No overflow, just add the full amount
                toStock.simulationAmount = newAmount;
                // Ensure overflowAmount is not incremented if there is no overflow for this connection
              }
            } else {
              // Regular connection behavior - cap at capacity and track overflow
              if (newAmount > capacity && capacity !== Infinity) {
                // Calculate excess amount for this connection
                const excessAmount = newAmount - capacity;
                // Add to overflow amount after this connection
                toStock.overflowAmount =
                  (toStock.overflowAmount || 0) + excessAmount;
                // Cap simulation amount at capacity
                toStock.simulationAmount = capacity;
                console.log(
                  `Stock ${toStock.name} reached capacity limit of ${capacity}. ` +
                    `${excessAmount} excess tracked as overflow.`
                );
              } else {
                // No overflow, just set the amount
                toStock.simulationAmount = newAmount;
                // Ensure overflowAmount is not incremented if there is no overflow for this connection
              }
            }
            console.log(
              `Added ${amountToAdd} to ${toStock.name}, new amount: ${toStock.simulationAmount}`
            );
          }
        }
      }
    });

    // Check for stocks with overflow amounts but no outbound overflow connections
    // Only reset overflowAmount if the box cannot transfer overflow out in the next step
    updatedBoxes.forEach((box) => {
      if (box.overflowAmount > 0) {
        // Check if there's any overflow connection FROM this box
        const hasOutboundOverflowConnection = jsonData.connections.some(
          (conn) => conn.isOverflow && conn.fromStockId === box.id
        );
        // If no outbound overflow connection, reset its overflow amount
        if (!hasOutboundOverflowConnection) {
          console.log(
            `Resetting overflow amount for ${box.name} as there are no outbound overflow connections from it.`
          );
          box.overflowAmount = 0;
        }
      }
    });

    // Update the JSON data - keep original amount unchanged, but include simulation amount and overflow amount for display
    const updatedJsonData = {
      ...jsonData,
      boxes: updatedBoxes.map((box) => {
        // Ensure we maintain all the box properties, with updated simulation values
        const updatedBox = {
          ...box,
          // Keep the original amount unchanged
          amount: box.amount,
          // Make sure simulationAmount is always included
          simulationAmount: box.simulationAmount,
          // Include overflowAmount (will be 0 if not set)
          overflowAmount: box.overflowAmount || 0,
        };

        console.log(`Updated box ${box.name} after simulation:`, {
          id: updatedBox.id,
          amount: updatedBox.amount,
          simulationAmount: updatedBox.simulationAmount,
          overflowAmount: updatedBox.overflowAmount,
        });

        return updatedBox;
      }),
    };

    // Update the UI with the simulation results
    console.log("Setting JSON data with simulation results:", updatedJsonData);
    console.log(
      "Simulation amounts for each stock:",
      updatedJsonData.boxes.map((box) => ({
        id: box.id,
        name: box.name,
        amount: box.amount,
        simulationAmount: box.simulationAmount,
      }))
    );

    setJsonData(updatedJsonData);
    // Don't update the editor value to avoid overwriting the original model
    // setEditorValue(JSON.stringify(updatedJsonData, null, 2));

    // Increment simulation step counter
    setSimulationSteps((prev) => prev + 1);

    // Record simulation history for plotting
    const currentStep = simulationSteps + 1;
    const stepData = {
      step: currentStep,
      stocks: updatedBoxes.map((box) => {
        // Make sure all IDs are stored as strings to match the select element value
        // The select element always provides values as strings
        return {
          id: String(box.id), // Convert ID to string to ensure type consistency with dropdown
          name: box.name || box.stockName || "",
          simulationAmount:
            box.simulationAmount !== undefined
              ? box.simulationAmount
              : box.amount,
          // Include overflowAmount in the history
          overflowAmount: box.overflowAmount || 0,
        };
      }),
    };
    console.log("Stock data being recorded:", stepData.stocks);
    setSimulationHistory((prev) => [...prev, stepData]);

    console.log(
      "Recording simulation history step:",
      currentStep,
      "with stocks:",
      stepData.stocks
    );

    // Remove the refreshBoxes call - not needed anymore
    // refreshBoxes(updatedJsonData); // REMOVED
  };



  const resetSimulation = () => {
    // Reset simulation step counter
    setSimulationSteps(0);

    // Clear simulation history
    setSimulationHistory([]);

    // Reset simulation amounts to original amounts
    if (jsonData && jsonData.boxes) {
      const resetBoxes = jsonData.boxes.map((box) => {
        // Reset simulationAmount to match the original amount
        return {
          ...box,
          simulationAmount: box.amount,
        };
      });

      const resetJsonData = {
        ...jsonData,
        boxes: resetBoxes,
      };

      // Update the UI with reset data
      setJsonData(resetJsonData);
      // Don't update the editor to preserve the original model
      // setEditorValue(JSON.stringify(resetJsonData, null, 2));

      // Remove this line:
      // refreshBoxes(resetJsonData); // REMOVED
    }
  };

  const updateConnectionsOnDrag = (draggedBox, boxIndex) => {
    // Update JSON data for the dragged box
    setJsonData((prev) => {
      const newBoxes = [...prev.boxes];
      newBoxes[boxIndex] = {
        ...newBoxes[boxIndex],
        position: {
          x: Math.round(draggedBox.position.x),
          y: Math.round(draggedBox.position.y),
        },
        amount: newBoxes[boxIndex].amount || 0,
      };
      return { ...prev, boxes: newBoxes };
    });

    // Update all connections based on stockId, not array index
    if (!jsonData || !jsonData.connections) return;
    jsonData.connections.forEach((connData, i) => {
      const connection = paperState.current.connections[i];
      if (!connection) return;
      // Find the from and to boxes by stockId
      const fromBox = paperState.current.boxes.find(
        (b) => b.stockId === connData.fromStockId
      );
      const toBox = paperState.current.boxes.find(
        (b) => b.stockId === connData.toStockId
      );
      if (!fromBox || !toBox) return;

      // Check if this is a self-connection
      if (connData.fromStockId === connData.toStockId) {
        // Only update self-connection if the dragged box is the same as the self-connection's box
        if (draggedBox.stockId !== connData.fromStockId) {
          return; // Skip updating this self-connection if it's not the dragged box
        }

        // For self-connections, update the position but keep the same relative structure
        const boxBounds = fromBox.bounds;
        const boxCenter = fromBox.position;
        const loopRadius = 150;

        // Update the self-connection position
        const startPoint = new paper.Point(boxBounds.right, boxCenter.y);
        const endPoint = new paper.Point(boxBounds.right, boxCenter.y - 5);
        const controlOffset = loopRadius;
        const control1 = new paper.Point(
          boxBounds.right + controlOffset,
          boxCenter.y - controlOffset
        );
        const control2 = new paper.Point(
          boxBounds.right + controlOffset,
          boxCenter.y + controlOffset
        );

        const path = connection.children[0];
        if (path && path.segments) {
          path.segments[0].point = startPoint;
          path.segments[1].point = endPoint;
          path.segments[0].handleOut = control1.subtract(startPoint);
          path.segments[1].handleIn = control2.subtract(endPoint);
        }

        // Update arrow position for self-connection
        const arrowHead = connection.children[1];
        if (arrowHead && arrowHead.segments) {
          const arrowSize = 8;
          const arrowDirection = new paper.Point(-1, 0);
          const perpendicular = new paper.Point(0, -1);
          const arrowTip = endPoint;
          const arrowBase = arrowTip.subtract(
            arrowDirection.multiply(arrowSize)
          );
          const arrowLeft = arrowBase.add(
            perpendicular.multiply(arrowSize / 2)
          );
          const arrowRight = arrowBase.subtract(
            perpendicular.multiply(arrowSize / 2)
          );

          arrowHead.segments[0].point = arrowTip;
          arrowHead.segments[1].point = arrowLeft;
          arrowHead.segments[2].point = arrowRight;
        }

        // Update name label position if it exists
        if (connection.children[2]) {
          const labelPosition = new paper.Point(
            boxBounds.right + loopRadius,
            boxCenter.y
          );
          connection.children[2].position = labelPosition;
        }

        return; // Skip regular connection logic for self-connections
      }

      // Ensure direction is consistent with connection data: from -> to
      const end = getEdgePoint(fromBox, toBox);
      const start = getEdgePoint(toBox, fromBox);
      const arrowSize = 8;
      // Calculate direction and snap to nearest axis (horizontal or vertical only)
      const rawDirection = end.subtract(start);

      let direction;
      if (Math.abs(rawDirection.x) > Math.abs(rawDirection.y)) {
        // Horizontal direction
        direction = new paper.Point(rawDirection.x > 0 ? 1 : -1, 0);
      } else {
        // Vertical direction
        direction = new paper.Point(0, rawDirection.y > 0 ? 1 : -1);
      }
      const perpendicular = new paper.Point(-direction.y, direction.x);
      const arrowBase = end.subtract(direction.multiply(arrowSize));
      // Ensure arrow points in correct direction: from -> to
      const arrowLeft = arrowBase.add(perpendicular.multiply(arrowSize / 2));
      const arrowRight = arrowBase.subtract(
        perpendicular.multiply(arrowSize / 2)
      );
      // The curve should end at the base of the arrow, not the box
      // Handle calculations should follow the arrow direction
      let handle1, handle2;
      if (Math.abs(direction.x) > 0) {
        // Horizontal arrow - curve should be vertical
        handle1 = new paper.Point((start.x + arrowBase.x) / 2, start.y);
        handle2 = new paper.Point((start.x + arrowBase.x) / 2, arrowBase.y);
      } else {
        // Vertical arrow - curve should be horizontal
        handle1 = new paper.Point(start.x, (start.y + arrowBase.y) / 2);
        handle2 = new paper.Point(arrowBase.x, (start.y + arrowBase.y) / 2);
      }
      const path = connection.children[0];
      if (path && path.segments) {
        path.segments[0].point = start;
        path.segments[1].point = arrowBase;
        path.segments[0].handleOut = handle1.subtract(start);
        path.segments[1].handleIn = handle2.subtract(arrowBase);
      }
      // Arrow always on 'to' side - maintain same segment order as creation
      const arrowHead = connection.children[1];
      if (arrowHead && arrowHead.segments) {
        // Match the creation order: [arrowTip, arrowLeft, arrowRight]
        arrowHead.segments[0].point = end; // arrowTip
        arrowHead.segments[1].point = arrowLeft;
        arrowHead.segments[2].point = arrowRight;
      }
      // Update connection name label if it exists
      const nameLabel = connection.children[2];
      if (nameLabel && nameLabel.content) {
        const midPoint = start.add(arrowBase).divide(2);
        nameLabel.point = midPoint.add(new paper.Point(0, -10));
      }
    });
    if (paper.view) paper.view.draw();
  };

  // Toolbox rendering function
  const renderToolbox = () => (
    <div
      style={{
        position: "absolute",
        top: toolboxPosition.y,
        left: toolboxPosition.x,
        zIndex: 10,
        backgroundColor: "#f0f0f0",
        border: "1px solid #ccc",
        borderRadius: "5px",
        boxShadow: "0 2px 5px rgba(0,0,0,0.2)",
        width: toolboxCollapsed ? "80px" : "300px",
        transition: "width 0.3s ease",
        overflow: "hidden",
      }}
    >
      {/* Toolbox header with drag handle and collapse button */}
      <div
        style={{
          padding: "8px",
          backgroundColor:
            currentMode === "add"
              ? "#e0ffe0"
              : currentMode === "connect"
              ? "#e0e0ff"
              : "#e0e0e0",
          cursor: "move",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          transition: "background-color 0.3s ease",
        }}
        onMouseDown={(e) => {
          const startX = e.clientX;
          const startY = e.clientY;
          const startLeft = toolboxPosition.x;
          const startTop = toolboxPosition.y;
          const onMouseMove = (moveEvent) => {
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;
            setToolboxPosition({
              x: startLeft + dx,
              y: startTop + dy,
            });
          };
          const onMouseUp = () => {
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
          };
          document.addEventListener("mousemove", onMouseMove);
          document.addEventListener("mouseup", onMouseUp);
        }}
      >
        <span>
          {toolboxCollapsed ? (
            "🧰"
          ) : currentMode === "add" ? (
            <span style={{ color: "#4CAF50", fontWeight: "bold" }}>
              Click to place: {pendingStockData?.name}
            </span>
          ) : currentMode === "connect" ? (
            <span style={{ color: "#2196F3", fontWeight: "bold" }}>
              Connect Mode:{" "}
              {connectionStart ? "Select target stock" : "Select first stock"}
            </span>
          ) : selectedItem ? (
            <span style={{ color: "#ff6600", fontWeight: "bold" }}>
              Selected: {selectedItem.name}
            </span>
          ) : (
            "Stock Toolbox"
          )}
        </span>
        <div style={{ display: "flex", gap: "5px" }}>
          {currentMode === "add" && !toolboxCollapsed && (
            <button
              onClick={() => {
                setCurrentMode("normal");
                setPendingStockData(null);
              }}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: "16px",
                color: "#f44336",
              }}
              title="Cancel placement"
            >
              ✖
            </button>
          )}
          <button
            onClick={() => setToolboxCollapsed(!toolboxCollapsed)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "16px",
            }}
          >
            {toolboxCollapsed ? "➕" : "➖"}
          </button>
        </div>
      </div>
      {/* Toolbox content (copy from your main render) */}
      {!toolboxCollapsed && (
        <div style={{ padding: "10px" }}>
          <label
            htmlFor="mode-select"
            style={{ fontWeight: "bold", marginRight: "8px" }}
          >
            Mode:
          </label>
          <select
            id="mode-select"
            value={currentMode}
            onChange={(e) => {
              setCurrentMode(e.target.value);
              // Reset any pending states when changing modes
              if (e.target.value !== "add") {
                setPendingStockData(null);
              }
              if (e.target.value !== "connect") {
                setConnectionStart(null);
                if (tempConnectionLine) {
                  tempConnectionLine.remove();
                  setTempConnectionLine(null);
                }
              }
              if (e.target.value !== "edit") {
                setSelectedItem(null);
                setEditingItem(null);
                setSelectedBoxId(null);
              }
            }}
            style={{ marginBottom: "10px", width: "100%" }}
          >
            <option value="normal">Normal</option>
            <option value="add">Add Stock</option>
            <option value="connect">Connect</option>
            <option value="edit">Edit</option>
            <option value="simulate">Simulate</option>
          </select>
          {currentMode === "add" && (
            <div style={{ marginTop: "10px" }}>
              <select
                value={newStockShape}
                onChange={(e) => {
                  setNewStockShape(e.target.value);
                  if (e.target.value === "circle") {
                    setNewStockAmount(0); // Reset amount for infinite stocks
                  }
                }}
                style={{ width: "100%", marginBottom: "6px", padding: "4px" }}
              >
                <option value="rectangle">Rectangle (Finite Stock)</option>
                <option value="circle">Circle (Infinite Stock)</option>
              </select>
              <input
                type="text"
                placeholder="Stock Name"
                value={newStockName}
                onChange={(e) => setNewStockName(e.target.value)}
                style={{ width: "100%", marginBottom: "6px", padding: "4px" }}
              />
              {newStockShape === "rectangle" && (
                <input
                  type="number"
                  placeholder="Amount"
                  value={newStockAmount}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setNewStockAmount(isNaN(value) ? 0 : value);
                  }}
                  style={{ width: "100%", marginBottom: "6px", padding: "4px" }}
                />
              )}
              {newStockShape === "circle" && (
                <div
                  style={{
                    padding: "8px",
                    marginBottom: "6px",
                    backgroundColor: "#e8f5e8",
                    borderRadius: "4px",
                    textAlign: "center",
                    fontSize: "12px",
                  }}
                >
                  Infinite Stock (∞)
                </div>
              )}
              <button
                style={{
                  width: "100%",
                  background: "#4CAF50",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  padding: "6px",
                  fontWeight: "bold",
                }}
                onClick={() => {
                  const isValidFinite =
                    newStockShape === "rectangle" &&
                    newStockName &&
                    newStockName.trim() !== "";
                  const isValidInfinite =
                    newStockShape === "circle" &&
                    newStockName &&
                    newStockName.trim() !== "";

                  if (isValidFinite || isValidInfinite) {
                    addBoxWithNameAndAmount(
                      newStockName,
                      newStockAmount,
                      newStockShape
                    );
                    setNewStockName("");
                    setNewStockAmount(0);
                    setNewStockShape("rectangle");
                  }
                }}
              >
                Add Stock
              </button>
            </div>
          )}
          {currentMode === "edit" && (
            <div style={{ marginTop: "10px" }}>
              {/* Edit Mode Info */}
              <div
                style={{
                  marginBottom: "10px",
                  padding: "8px",
                  backgroundColor: "#f8f9fa",
                  borderRadius: "4px",
                  border: "1px solid #dee2e6",
                }}
              >
                <strong>Edit Mode:</strong> Click on a stock or connection to
                edit it
              </div>
              
              {/* Filter Toggle */}
              <div
                style={{
                  marginBottom: "10px",
                  padding: "8px",
                  backgroundColor: "#e3f2fd",
                  borderRadius: "4px",
                  border: "1px solid #bbdefb",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <input
                  type="checkbox"
                  id="edit-filter-toggle"
                  checked={editModeFilterEnabled}
                  onChange={(e) => setEditModeFilterEnabled(e.target.checked)}
                  style={{ margin: 0 }}
                />
                <label
                  htmlFor="edit-filter-toggle"
                  style={{
                    margin: 0,
                    fontSize: "12px",
                    fontWeight: "bold",
                    cursor: "pointer",
                  }}
                >
                  Show only selected item and connected elements
                </label>
              </div>
              {selectedItem && selectedItem.type === "stock" ? (
                <div>
                  <div
                    style={{
                      marginBottom: "10px",
                      padding: "8px",
                      backgroundColor: "#fff3cd",
                      borderRadius: "4px",
                      border: "1px solid #ffeaa7",
                    }}
                  >
                    <strong>Editing: {selectedItem.name}</strong>
                  </div>
                  <div style={{ marginBottom: "6px" }}>
                    <label
                      style={{
                        display: "block",
                        marginBottom: "2px",
                        fontWeight: "bold",
                        fontSize: "12px",
                      }}
                    >
                      Stock Name:
                    </label>
                    <input
                      type="text"
                      placeholder="Enter stock name"
                      value={editingItem?.name || ""}
                      onChange={(e) =>
                        setEditingItem({ ...editingItem, name: e.target.value })
                      }
                      style={{ width: "70%", padding: "4px" }}
                    />
                  </div>
                  <div style={{ marginBottom: "6px" }}>
                    <label
                      style={{
                        display: "block",
                        marginBottom: "2px",
                        fontWeight: "bold",
                        fontSize: "12px",
                      }}
                    >
                      Amount:
                    </label>
                    <input
                      type="number"
                      placeholder="Enter amount"
                      value={editingItem?.amount || 0}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        setEditingItem({
                          ...editingItem,
                          amount: isNaN(value) ? 0 : value,
                        });
                      }}
                      style={{ width: "70%", padding: "4px" }}
                    />
                  </div>
                  <div style={{ marginBottom: "6px" }}>
                    <label
                      style={{
                        display: "block",
                        marginBottom: "2px",
                        fontWeight: "bold",
                        fontSize: "12px",
                      }}
                    >
                      Capacity (0 for infinite):
                    </label>
                    <input
                      type="number"
                      placeholder="Enter capacity"
                      value={editingItem?.capacity || 0}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        setEditingItem({
                          ...editingItem,
                          capacity: isNaN(value) ? 0 : value,
                        });
                      }}
                      style={{ width: "70%", padding: "4px" }}
                    />
                  </div>
                  <div
                    style={{ display: "flex", gap: "5px", marginBottom: "5px" }}
                  >
                    <button
                      style={{
                        flex: 1,
                        background: "#007bff",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        padding: "6px",
                        fontWeight: "bold",
                      }}
                      onClick={() => {
                        if (
                          editingItem?.name &&
                          editingItem?.name.trim() !== "" &&
                          typeof editingItem?.amount === "number"
                        ) {
                          // Update the JSON data
                          const updatedJsonData = {
                            ...jsonData,
                            boxes: jsonData.boxes.map((box) =>
                              box.id === selectedItem.id
                                ? {
                                    ...box,
                                    name: editingItem.name,
                                    amount: editingItem.amount,
                                    capacity: editingItem.capacity,
                                  }
                                : box
                            ),
                          };
                          setJsonData(updatedJsonData);
                          setEditorValue(
                            JSON.stringify(updatedJsonData, null, 2)
                          );
                          // Clear selection after saving
                          setSelectedItem(null);
                          setEditingItem(null);
                          setSelectedBoxId(null);
                        } else {
                          alert("Please enter a valid stock name and amount.");
                        }
                      }}
                    >
                      Save
                    </button>
                    <button
                      style={{
                        flex: 1,
                        background: "#6c757d",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        padding: "6px",
                        fontWeight: "bold",
                      }}
                      onClick={() => {
                        setSelectedItem(null);
                        setEditingItem(null);
                        setSelectedBoxId(null);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                  <button
                    style={{
                      width: "100%",
                      background: "#f44336",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      padding: "6px",
                      fontWeight: "bold",
                    }}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Remove stock '${selectedItem.name}' and all its connections?`
                        )
                      ) {
                        // Remove the stock and all its connections
                        const updatedJsonData = {
                          ...jsonData,
                          boxes: jsonData.boxes.filter(
                            (box) => box.id !== selectedItem.id
                          ),
                          connections: jsonData.connections.filter(
                            (conn) =>
                              conn.fromStockId !== selectedItem.id &&
                              conn.toStockId !== selectedItem.id
                          ),
                        };
                        setJsonData(updatedJsonData);
                        setEditorValue(
                          JSON.stringify(updatedJsonData, null, 2)
                        );
                        setSelectedItem(null);
                        setEditingItem(null);
                        setSelectedBoxId(null);
                      }
                    }}
                  >
                    Remove Stock
                  </button>
                </div>
              ) : selectedItem && selectedItem.type === "connection" ? (
                <div>
                  <div
                    style={{
                      marginBottom: "10px",
                      padding: "8px",
                      backgroundColor: "#e7f3ff",
                      borderRadius: "4px",
                      border: "1px solid #b3d9ff",
                    }}
                  >
                    <strong>Editing Connection: {selectedItem.name}</strong>
                  </div>
                  <div style={{ marginBottom: "6px" }}>
                    <label
                      style={{
                        display: "block",
                        marginBottom: "2px",
                        fontWeight: "bold",
                        fontSize: "12px",
                      }}
                    >
                      Connection Name:
                    </label>
                    <input
                      type="text"
                      placeholder="Enter connection name"
                      value={editingItem?.name || ""}
                      onChange={(e) =>
                        setEditingItem({ ...editingItem, name: e.target.value })
                      }
                      style={{ width: "70%", padding: "4px" }}
                    />
                  </div>
                  <div style={{ marginBottom: "6px" }}>
                    <label
                      style={{
                        display: "block",
                        marginBottom: "2px",
                        fontWeight: "bold",
                        fontSize: "12px",
                      }}
                    >
                      Amount:
                    </label>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                      }}
                    >
                      <input
                        type="number"
                        placeholder="Amount to transfer"
                        value={
                          editingItem?.isOverflow
                            ? 0
                            : typeof editingItem?.amount === "string" &&
                              editingItem.amount.includes("%")
                            ? editingItem.amount.replace("%", "")
                            : editingItem?.amount ?? 1
                        }
                        onChange={(e) => {
                          const value = e.target.value;
                          const isPercent = document.getElementById(
                            "amount-percent-checkbox"
                          ).checked;
                          const numericValue = Number(value);
                          const validValue = isNaN(numericValue)
                            ? 0
                            : numericValue;
                          const newAmount = isPercent
                            ? `${validValue}%`
                            : validValue;
                          setEditingItem({
                            ...editingItem,
                            amount: newAmount,
                            // If amount is set, ensure isOverflow is false
                            isOverflow: false,
                          });
                        }}
                        style={{ width: "60%", padding: "4px" }}
                        min="0"
                        step="0.1"
                        disabled={editingItem?.isOverflow || false}
                      />
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "2px",
                        }}
                      >
                        <input
                          id="amount-percent-checkbox"
                          type="checkbox"
                          checked={
                            typeof editingItem?.amount === "string" &&
                            editingItem.amount.includes("%")
                          }
                          onChange={(e) => {
                            const isPercent = e.target.checked;
                            let currentValue;
                            if (
                              typeof editingItem?.amount === "string" &&
                              editingItem.amount.includes("%")
                            ) {
                              const parsed = parseFloat(
                                editingItem.amount.replace("%", "")
                              );
                              currentValue = isNaN(parsed) ? 1 : parsed;
                            } else {
                              const parsed = Number(editingItem?.amount ?? 1);
                              currentValue = isNaN(parsed) ? 1 : parsed;
                            }
                            setEditingItem({
                              ...editingItem,
                              amount: isPercent
                                ? `${currentValue}%`
                                : currentValue,
                            });
                          }}
                        />
                        <label
                          htmlFor="amount-percent-checkbox"
                          style={{ fontSize: "12px" }}
                        >
                          %
                        </label>
                      </div>
                    </div>
                  </div>
                  <div style={{ marginBottom: "6px" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                      }}
                    >
                      <input
                        id="overflow-checkbox"
                        type="checkbox"
                        checked={editingItem?.isOverflow || false}
                        onChange={(e) => {
                          const isOverflow = e.target.checked;
                          setEditingItem({
                            ...editingItem,
                            isOverflow: isOverflow,
                            // If isOverflow is true, set amount to 0
                            amount: isOverflow
                              ? 0
                              : editingItem?.amount || 1,
                          });
                        }}
                      />
                      <label
                        htmlFor="overflow-checkbox"
                        style={{ fontSize: "12px" }}
                      >
                        Overflow connection (transfers excess amount beyond
                        capacity without respecting target's capacity limit)
                      </label>
                    </div>
                  </div>
                  <div style={{ marginBottom: "6px" }}>
                    <label
                      style={{
                        display: "block",
                        marginBottom: "2px",
                        fontWeight: "bold",
                        fontSize: "12px",
                      }}
                    >
                      Processing Order:
                    </label>
                    <input
                      type="number"
                      placeholder="Order for simulation processing"
                      value={editingItem?.order ?? editingItem?.id ?? 1}
                      onChange={(e) => {
                        const value = e.target.value;
                        const numericValue = Number(value);
                        const validValue = isNaN(numericValue)
                          ? 1
                          : numericValue;
                        setEditingItem({
                          ...editingItem,
                          order: validValue,
                        });
                      }}
                      style={{ width: "60%", padding: "4px" }}
                      min="1"
                      step="1"
                    />
                    <div
                      style={{
                        fontSize: "11px",
                        color: "#666",
                        marginTop: "2px",
                      }}
                    >
                      Connections are processed from lowest to highest order
                      during simulation
                    </div>
                  </div>
                  <div
                    style={{ display: "flex", gap: "5px", marginBottom: "5px" }}
                  >
                    <button
                      style={{
                        flex: 1,
                        background: "#007bff",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        padding: "6px",
                        fontWeight: "bold",
                      }}
                      onClick={() => {
                        console.log("Connection Save button clicked");
                        console.log("editingItem:", editingItem);
                        console.log("selectedItem:", selectedItem);
                        console.log(
                          "jsonData.connections:",
                          jsonData.connections
                        );

                        // Safeguard: ensure editingItem has the right properties with valid values
                        // Now supporting both numeric values and percentage strings
                        // A connection can only be either an overflow connection or have an amount, not both
                        const safeEditingItem = {
                          ...editingItem,
                          name: editingItem?.name || "Unnamed Connection",
                          // If it's an overflow connection, amount should be 0
                          // Otherwise, ensure amount has a valid value
                          amount: editingItem?.isOverflow
                            ? 0
                            : editingItem?.amount !== undefined &&
                              editingItem?.amount !== null &&
                              editingItem?.amount !== ""
                            ? editingItem.amount
                            : 1,
                          isOverflow: editingItem?.isOverflow || false,
                          // Ensure order has a valid value, defaulting to the connection's ID if not set
                          order: editingItem?.order ?? selectedItem?.id ?? 1,
                        };
                        console.log(
                          "Safe editing item with defaults:",
                          safeEditingItem
                        );

                        // Validate amount (can be number or percentage string) if not an overflow connection
                        const isValidAmount = safeEditingItem.isOverflow
                          ? true // Overflow connections don't need an amount validation
                          : typeof safeEditingItem.amount === "number"
                          ? safeEditingItem.amount >= 0
                          : typeof safeEditingItem.amount === "string" &&
                            safeEditingItem.amount.includes("%") &&
                            parseFloat(safeEditingItem.amount) >= 0;

                        if (
                          safeEditingItem.name &&
                          safeEditingItem.name.trim() !== "" &&
                          isValidAmount
                        ) {
                          console.log(
                            "Connection validation passed, saving changes..."
                          );

                          // Update the JSON data using the safe values we created
                          const updatedJsonData = {
                            ...jsonData,
                            connections: jsonData.connections.map((conn) => {
                              console.log(
                                "Comparing connection ID:",
                                conn.id,
                                "with selected ID:",
                                selectedItem.id
                              );
                              if (conn.id === selectedItem.id) {
                                console.log(
                                  "Found matching connection to update"
                                );
                                return {
                                  ...conn,
                                  name: safeEditingItem.name,
                                  amount: safeEditingItem.amount,
                                  isOverflow:
                                    safeEditingItem.isOverflow || false,
                                  order: safeEditingItem.order ?? conn.id,
                                };
                              }
                              return conn;
                            }),
                          };

                          console.log("Updated JSON data:", updatedJsonData);

                          // First update the selected item to show changes immediately in the UI
                          setSelectedItem({
                            ...selectedItem,
                            name: safeEditingItem.name,
                            amount: safeEditingItem.amount,
                            isOverflow: safeEditingItem.isOverflow || false,
                            order: safeEditingItem.order,
                          });

                          // Update the editing item as well with the safe values
                          setEditingItem({
                            ...editingItem,
                            name: safeEditingItem.name,
                            amount: safeEditingItem.amount,
                            isOverflow: safeEditingItem.isOverflow || false,
                            order: safeEditingItem.order,
                          });

                          // Then update the JSON data which will trigger both refreshes
                          setJsonData(updatedJsonData);

                          // Manually trigger the editor update for immediate feedback
                          setEditorValue(
                            JSON.stringify(updatedJsonData, null, 2)
                          );

                          // Immediately update the connection label to reflect the new values
                          console.log(
                            "Refreshing connections to update visuals"
                          );
                          refreshConnections(updatedJsonData);

                          // Clear selection after saving
                          setSelectedItem(null);
                          console.log("Connection saved successfully");
                        } else {
                          console.error("Validation failed:", {
                            name: safeEditingItem.name,

                            transferAmount: safeEditingItem.transferAmount,
                          });
                          alert(
                            "Please fill in all fields with valid values before saving. Values must be valid numbers."
                          );
                        }
                      }}
                    >
                      Save
                    </button>
                    <button
                      style={{
                        flex: 1,
                        background: "#6c757d",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        padding: "6px",
                        fontWeight: "bold",
                      }}
                      onClick={() => {
                        setSelectedItem(null);
                        setEditingItem(null);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                  <button
                    style={{
                      width: "100%",
                      background: "#f44336",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      padding: "6px",
                      fontWeight: "bold",
                    }}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Remove connection '${selectedItem.name}'?`
                        )
                      ) {
                        // Remove the connection
                        const updatedJsonData = {
                          ...jsonData,
                          connections: jsonData.connections.filter(
                            (conn) => conn.id !== selectedItem.id
                          ),
                        };
                        setJsonData(updatedJsonData);
                        setEditorValue(
                          JSON.stringify(updatedJsonData, null, 2)
                        );
                        setSelectedItem(null);
                        setEditingItem(null);
                        // Refresh visual connections to remove the deleted connection
                        refreshConnections(updatedJsonData);
                      }
                    }}
                  >
                    Remove Connection
                  </button>
                </div>
              ) : (
                <div
                  style={{
                    padding: "10px",
                    textAlign: "center",
                    color: "#6c757d",
                  }}
                >
                  Click on a connection to edit it
                </div>
              )}
            </div>
          )}
          {currentMode === "simulate" && (
            <div style={{ marginTop: "10px" }}>
              <div
                style={{
                  marginBottom: "10px",
                  padding: "8px",
                  backgroundColor: "#f0f8ff",
                  borderRadius: "4px",
                  border: "1px solid #b3d9ff",
                }}
              >
                <strong>Simulation Mode</strong>
              </div>

              {/* Step Counter Display */}
              {/* Simulation Button */}
              <button
                style={{
                  width: "100%",
                  background: "#28a745",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  padding: "8px",
                  fontWeight: "bold",
                  fontSize: "12px",
                  marginBottom: "10px",
                }}
                onClick={() => {
                  runSimulation();
                }}
              >
                Run 1 Step
              </button>

              <button
                style={{
                  width: "100%",
                  background: "#6c757d",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  padding: "8px",
                  fontWeight: "bold",
                  fontSize: "12px",
                }}
                onClick={() => {
                  resetSimulation();
                }}
              >
                Reset Counter
              </button>

              {/* Plot Controls */}
              {simulationHistory.length > 0 && (
                <div
                  style={{
                    marginTop: "10px",
                    padding: "8px",
                    backgroundColor: "#f8f9fa",
                    borderRadius: "4px",
                    border: "1px solid #dee2e6",
                  }}
                >
                  {/* Plot Mode Selection */}
                  <div style={{ marginBottom: "8px" }}>
                    <label
                      style={{
                        display: "block",
                        marginBottom: "4px",
                        fontWeight: "bold",
                        fontSize: "12px",
                      }}
                    >
                      Plot Mode:
                    </label>
                    <div style={{ display: "flex", gap: "8px", marginBottom: "6px" }}>
                      <label style={{ fontSize: "11px", display: "flex", alignItems: "center" }}>
                        <input
                          type="radio"
                          value="single"
                          checked={plotMode === "single"}
                          onChange={(e) => setPlotMode(e.target.value)}
                          style={{ marginRight: "4px" }}
                        />
                        Single Stock
                      </label>
                      <label style={{ fontSize: "11px", display: "flex", alignItems: "center" }}>
                        <input
                          type="radio"
                          value="sum"
                          checked={plotMode === "sum"}
                          onChange={(e) => setPlotMode(e.target.value)}
                          style={{ marginRight: "4px" }}
                        />
                        Sum of Stocks
                      </label>
                    </div>
                  </div>

                  {/* Single Stock Selection */}
                  {plotMode === "single" && (
                    <div style={{ marginBottom: "8px" }}>
                      <label
                        style={{
                          display: "block",
                          marginBottom: "4px",
                          fontWeight: "bold",
                          fontSize: "12px",
                        }}
                      >
                        Select Stock to Plot:
                      </label>
                      <select
                        value={selectedStockForPlot}
                        onChange={(e) => {
                          console.log(
                            "Selected stock ID from dropdown:",
                            e.target.value
                          );
                          setSelectedStockForPlot(e.target.value);
                        }}
                        style={{
                          width: "100%",
                          padding: "4px",
                          marginBottom: "6px",
                        }}
                      >
                        <option value="">Choose a stock...</option>
                        {jsonData.boxes
                          .filter((box) => box.name && box.shape !== "circle")
                          .map((box) => (
                            <option key={box.id} value={String(box.id)}>
                              {box.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}

                  {/* Multiple Stock Selection */}
                  {plotMode === "sum" && (
                    <div style={{ marginBottom: "8px" }}>
                      <label
                        style={{
                          display: "block",
                          marginBottom: "4px",
                          fontWeight: "bold",
                          fontSize: "12px",
                        }}
                      >
                        Select Stocks to Sum:
                      </label>
                      <div
                        style={{
                          maxHeight: "120px",
                          overflowY: "auto",
                          border: "1px solid #ccc",
                          borderRadius: "4px",
                          padding: "4px",
                          backgroundColor: "white",
                        }}
                      >
                        {jsonData.boxes
                          .filter((box) => box.name && box.shape !== "circle")
                          .map((box) => (
                            <label
                              key={box.id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                fontSize: "11px",
                                padding: "2px 0",
                                cursor: "pointer",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={selectedStocksForSum.includes(String(box.id))}
                                onChange={(e) => {
                                  const stockId = String(box.id);
                                  if (e.target.checked) {
                                    setSelectedStocksForSum(prev => [...prev, stockId]);
                                  } else {
                                    setSelectedStocksForSum(prev => prev.filter(id => id !== stockId));
                                  }
                                }}
                                style={{ marginRight: "6px" }}
                              />
                              {box.name}
                            </label>
                          ))}
                      </div>
                    </div>
                  )}

                  <button
                    style={{
                      width: "100%",
                      background: "#17a2b8",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      padding: "8px",
                      fontWeight: "bold",
                      fontSize: "12px",
                    }}
                    onClick={() => setShowPlotPanel(true)}
                    disabled={
                      plotMode === "single" 
                        ? !selectedStockForPlot 
                        : selectedStocksForSum.length === 0
                    }
                  >
                    Show Plot
                  </button>
                </div>
              )}

              <div
                style={{
                  fontSize: "11px",
                  color: "#6c757d",
                  textAlign: "center",
                  marginTop: "8px",
                }}
              >
                Set target steps (1-100) and run simulation
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        margin: 0,
        padding: 0,
        overflow: "hidden",
        position: "fixed",
        top: 0,
        left: 0,
      }}
    >
      {/* Robust style for SplitPane resizer cursor and pointer events */}
      <style>{`
        /* React Resizable Panels styles */
        [data-panel-resize-handle-enabled] {
          cursor: col-resize !important;
          pointer-events: auto !important;
          background-color: #e0e0e0;
          border: 1px solid #ccc;
          transition: all 0.2s ease;
          width: 4px;
          min-width: 4px;
          max-width: 4px;
        }
        [data-panel-resize-handle-enabled]:hover {
          cursor: col-resize !important;
          background-color: #007acc;
          border-color: #005a9e;
        }
        [data-panel-resize-handle-enabled]:active {
          cursor: col-resize !important;
          background-color: #005a9e;
          border-color: #004080;
        }
        /* Fallback for any resize handle */
        [data-panel-resize-handle] {
          cursor: col-resize !important;
          pointer-events: auto !important;
          background-color: #e0e0e0;
          border: 1px solid #ccc;
          transition: all 0.2s ease;
          width: 4px;
          min-width: 4px;
          max-width: 4px;
        }
        [data-panel-resize-handle]:hover {
          cursor: col-resize !important;
          background-color: #007acc;
          border-color: #005a9e;
        }
        [data-panel-resize-handle]:active {
          cursor: col-resize !important;
          background-color: #005a9e;
          border-color: #004080;
        }
        .stock-placement-cursor {
          cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Crect x='4' y='4' width='24' height='24' rx='2' ry='2' fill='%234CAF50' fill-opacity='0.7' stroke='%23333' stroke-width='2'/%3E%3Ctext x='16' y='20' font-family='Arial' font-size='12' text-anchor='middle' fill='white'%3ES%3C/text%3E%3C/svg%3E") 16 16, crosshair;
        }
        
        /* JSON Editor highlighting styles */
        .selected-json-highlight {
          background-color: rgba(255, 193, 7, 0.3) !important;
          border: 2px solid #ffc107 !important;
          border-radius: 4px !important;
          animation: highlight-pulse 2s ease-in-out;
        }
        
        @keyframes highlight-pulse {
          0% { background-color: rgba(255, 193, 7, 0.6); }
          50% { background-color: rgba(255, 193, 7, 0.3); }
          100% { background-color: rgba(255, 193, 7, 0.3); }
        }
      `}</style>
      <PanelGroup
        direction="horizontal"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
        }}
      >
        <Panel defaultSize={jsonEditorVisible ? 70 : 100} minSize={30}>
          <div style={{ width: "100%", height: "100%", position: "relative" }}>
            <canvas
              ref={canvasRef}
              id="myCanvas"
              resize="true"
              className={currentMode === "add" ? "stock-placement-cursor" : ""}
              style={{
                display: "block",
                width: "100%",
                height: "100%",
                cursor:
                  currentMode === "add"
                    ? "crosshair"
                    : currentMode === "connect"
                    ? "crosshair"
                    : "default",
              }}
              onMouseMove={(e) => {
                if (
                  currentMode === "connect" &&
                  connectionStart &&
                  paper.project
                ) {
                  const rect = e.target.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const y = e.clientY - rect.top;
                  // Remove existing temp line
                  if (tempConnectionLine) {
                    tempConnectionLine.remove();
                  }
                  // Find the starting stock position
                  const startStock = boxes.find(
                    (box) => box.stockId === connectionStart
                  );
                  if (startStock) {
                    const tempLine = new paper.Path.Line(
                      startStock.position,
                      new paper.Point(x, y)
                    );
                    tempLine.strokeColor = "red";
                    tempLine.strokeWidth = 2;
                    tempLine.dashArray = [5, 5];
                    setTempConnectionLine(tempLine);
                    if (paper.view) paper.view.draw();
                  }
                }
              }}
              onClick={(e) => {
                if (currentMode === "add" && pendingStockData) {
                  // Get canvas-relative coordinates
                  const rect = e.target.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const y = e.clientY - rect.top;
                  placeStockAtPosition(x, y);
                } else if (currentMode === "connect") {
                  // Get canvas-relative coordinates for hit testing
                  const rect = e.target.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const y = e.clientY - rect.top;
                  const point = new paper.Point(x, y);

                  // Use Paper.js hit testing to find clicked stock
                  const hitResult = paper.project.hitTest(point);

                  if (hitResult && hitResult.item) {
                    console.log("Hit test result:", hitResult.item);

                    // Try to find a stock by checking all boxes
                    const clickedPoint = new paper.Point(x, y);
                    console.log("Click coordinates:", x, y);
                    let foundStock = null;

                    // Check if the click is within any stock box bounds
                    for (const box of paperState.current.boxes) {
                      console.log(
                        "Checking box",
                        box.stockId,
                        "bounds:",
                        box.bounds.toString(),
                        "contains click:",
                        box.bounds.contains(clickedPoint)
                      );
                      if (box.bounds.contains(clickedPoint)) {
                        console.log(
                          "Found box containing click point:",
                          box.stockId
                        );
                        foundStock = box;
                        break;
                      }
                    }

                    if (foundStock) {
                      console.log("Found stock with ID:", foundStock.stockId);
                      // Found a stock, handle connection logic
                      handleConnectionClick(foundStock.stockId);
                    } else {
                      // Try the original parent traversal method as fallback
                      let stockGroup = hitResult.item;
                      console.log(
                        "Starting parent traversal from:",
                        stockGroup
                      );

                      // First try to find by stockId
                      while (stockGroup && !stockGroup.stockId) {
                        console.log("Traversing parent:", stockGroup.parent);
                        stockGroup = stockGroup.parent;
                      }

                      if (stockGroup && stockGroup.stockId) {
                        console.log(
                          "Found stock with ID (via parent traversal):",
                          stockGroup.stockId
                        );
                        // Found a stock, handle connection logic
                        handleConnectionClick(stockGroup.stockId);
                      } else {
                        // If stockId not found, try to find by checking all boxes
                        console.log("No stockId found, checking all boxes");
                        let foundBox = null;

                        for (const box of paperState.current.boxes) {
                          // Check if the hit result item is a child of this box
                          let isChild = false;
                          let currentItem = hitResult.item;

                          while (currentItem && !isChild) {
                            if (
                              currentItem === box ||
                              currentItem.parent === box
                            ) {
                              isChild = true;
                              break;
                            }
                            currentItem = currentItem.parent;
                          }

                          if (isChild) {
                            console.log(
                              "Found box containing hit item:",
                              box.stockId
                            );
                            foundBox = box;
                            break;
                          }
                        }

                        if (foundBox) {
                          console.log(
                            "Found stock with ID (via box search):",
                            foundBox.stockId
                          );
                          handleConnectionClick(foundBox.stockId);
                        } else {
                          console.log(
                            "No stock group found, canceling connection"
                          );
                          // Clicked on empty space or non-stock item, cancel connection
                          if (connectionStart) {
                            cancelConnectionTool();
                          }
                        }
                      }
                    }
                  } else {
                    console.log("No hit result, canceling connection");
                    // Clicked on empty space, cancel connection
                    if (connectionStart) {
                      cancelConnectionTool();
                    }
                  }
                  return;
                } else {
                  // Get canvas-relative coordinates for hit testing
                  const rect = e.target.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const y = e.clientY - rect.top;
                  const point = new paper.Point(x, y);
                  // Use Paper.js hit testing to check if we clicked on any item
                  const hitResult = paper.project.hitTest(point);
                  // If no item was hit, or only axes were hit, clear selection
                  if (
                    !hitResult ||
                    (hitResult.item && hitResult.item.name === "axis")
                  ) {
                    setSelectedItem(null);
                    setEditingItem(null);
                  }
                }
              }}
            />
            {renderToolbox()}
          </div>
        </Panel>
        {jsonEditorVisible && (
          <>
            <PanelResizeHandle
              style={{
                width: "4px",
                minWidth: "4px",
                maxWidth: "4px",
                cursor: "col-resize",
                backgroundColor: "#e0e0e0",
                border: "1px solid #ccc",
                transition: "all 0.2s ease",
                pointerEvents: "auto",
              }}
            />
            <Panel defaultSize={30} minSize={20}>
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  background: "#fff",
                  zIndex: 2,
                }}
              >
                <Editor
                  height="100%"
                  language="json"
                  value={editorValue}
                  onMount={(editor) => {
                    editorRef.current = editor;
                  }}
                  onChange={(value) => {
                    setEditorValue(value);
                    try {
                      const parsedValue = JSON.parse(value);

                      // Ensure connections have amount property
                      if (parsedValue.connections) {
                        parsedValue.connections = parsedValue.connections.map(
                          (conn) => {
                            // Preserve string format for percentage values
                            let amount =
                              conn.amount !== undefined ? conn.amount : 1;

                            // If the value is a string and contains '%', keep it as a string
                            // Otherwise, ensure it's a number
                            if (typeof amount === "string") {
                              if (!amount.includes("%")) {
                                amount = Number(amount);
                              }
                            } else if (typeof amount === "number") {
                              // Already a number, no conversion needed
                            } else if (amount !== undefined) {
                              // Convert other types to number
                              amount = Number(amount);
                            }

                            return {
                              ...conn,
                              amount: amount,
                            };
                          }
                        );
                      }

                      const dataWithSimulation =
                        ensureSimulationAmount(parsedValue);
                      setJsonData(dataWithSimulation);
                    } catch (error) {
                      // Don't update if JSON is invalid
                      console.error("Invalid JSON:", error);
                    }
                  }}
                  options={{
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    fontSize: 14,
                    automaticLayout: true,
                    formatOnPaste: true,
                    formatOnType: true,
                  }}
                />
              </div>
            </Panel>
          </>
        )}
      </PanelGroup>
      {/* JSON Editor Toggle Button - Positioned at bottom */}
      <button
        onClick={() => {
          if (jsonEditorVisible) {
            setSplitSize("100vw");
          } else {
            setSplitSize(window.innerWidth * 0.75);
          }
          setJsonEditorVisible((prev) => !prev);
        }}
        style={{
          position: "fixed",
          bottom: "20px",
          right: "20px",
          zIndex: 1000,
          padding: "10px 15px",
          backgroundColor: jsonEditorVisible ? "#ff6600" : "#4CAF50",
          color: "white",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
          fontSize: "14px",
          fontWeight: "bold",
          boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
        }}
        title={jsonEditorVisible ? "Hide JSON Editor" : "Show JSON Editor"}
      >
        {jsonEditorVisible ? "📝 Hide Editor" : "📝 Show Editor"}
      </button>

      {/* Canvas Selection Dropdown */}
      <div
        style={{
          position: "fixed",
          bottom: "20px",
          left: "20px",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          gap: "10px",
        }}
      >
        {/* Zoom Slider */}
        <label style={{ color: "#333", fontSize: "14px", fontWeight: "bold" }}>Zoom:</label>
        <input
          type="range"
          min={0.2}
          max={2}
          step={0.01}
          value={zoom}
          onChange={e => setZoom(Number(e.target.value))}
          style={{ width: "120px" }}
        />
        <span style={{ minWidth: 40, textAlign: "right", fontSize: 14 }}>{(zoom * 100).toFixed(0)}%</span>
        <label
          style={{
            color: "#333",
            fontSize: "14px",
            fontWeight: "bold",
          }}
        >
          Canvas:
        </label>
        <select
          value={currentCanvasName}
          onChange={(e) => handleCanvasSelection(e.target.value)}
          style={{
            padding: "8px 12px",
            fontSize: "14px",
            border: "1px solid #ccc",
            borderRadius: "4px",
            backgroundColor: "white",
            cursor: "pointer",
            minWidth: "150px",
          }}
        >
          {availableCanvases.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          <option value="new_canvas">+ New Canvas</option>
        </select>
        <button
          onClick={() => saveCurrentCanvas()}
          style={{
            padding: "8px 12px",
            backgroundColor: "#2196F3",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: "bold",
          }}
          title="Save current canvas"
        >
          💾 Save
        </button>
        <button
          onClick={async () => {
            if (currentCanvasName === "default") {
              alert("The default canvas cannot be deleted.");
              return;
            }
            if (window.confirm(`Are you sure you want to delete canvas '${currentCanvasName}'?`)) {
              await dbService.deleteCanvas(currentCanvasName);
              setAvailableCanvases((prev) => prev.filter((n) => n !== currentCanvasName));
              // If the deleted canvas was active, switch to default
              if (currentCanvasName !== "default") {
                setCurrentCanvasName("default");
                loadCanvas("default");
              }
            }
          }}
          style={{
            padding: "8px 12px",
            backgroundColor: "#f44336",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: "bold",
          }}
          title="Delete current canvas"
        >
          🗑️ Delete
        </button>
      </div>

      {/* New Canvas Dialog */}
      {showNewCanvasDialog && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
          }}
        >
          <div
            style={{
              backgroundColor: "white",
              padding: "20px",
              borderRadius: "8px",
              boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
              minWidth: "300px",
            }}
          >
            <h3 style={{ margin: "0 0 15px 0" }}>Create New Canvas</h3>
            <input
              type="text"
              placeholder="Enter canvas name"
              value={newCanvasName}
              onChange={(e) => setNewCanvasName(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  createNewCanvas(newCanvasName);
                }
              }}
              style={{
                width: "100%",
                padding: "10px",
                fontSize: "14px",
                border: "1px solid #ccc",
                borderRadius: "4px",
                marginBottom: "15px",
                boxSizing: "border-box",
              }}
              autoFocus
            />
            <div
              style={{
                display: "flex",
                gap: "10px",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => {
                  setShowNewCanvasDialog(false);
                  setNewCanvasName("");
                }}
                style={{
                  padding: "8px 16px",
                  backgroundColor: "#ccc",
                  color: "#333",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => createNewCanvas(newCanvasName)}
                style={{
                  padding: "8px 16px",
                  backgroundColor: "#4CAF50",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Plot Panel */}
      {showPlotPanel && (plotMode === "single" ? selectedStockForPlot : selectedStocksForSum.length > 0) && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
          }}
        >
          <div
            style={{
              backgroundColor: "white",
              padding: "20px",
              borderRadius: "8px",
              boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
              width: "80%",
              maxWidth: "800px",
              height: "80%",
              maxHeight: "600px",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "20px",
              }}
            >
              <h3 style={{ margin: 0 }}>
                Stock Amounts Over Time:{" "}
                {(() => {
                  if (plotMode === "single") {
                    const stock = jsonData.boxes.find(
                      (box) => String(box.id) === selectedStockForPlot
                    );
                    return stock
                      ? `${stock.name} (Current Overflow: ${
                          stock.overflowAmount || 0
                        })`
                      : "Unknown";
                  } else {
                    const selectedStocks = jsonData.boxes.filter((box) =>
                      selectedStocksForSum.includes(String(box.id))
                    );
                    const totalOverflow = selectedStocks.reduce(
                      (sum, stock) => sum + (stock.overflowAmount || 0),
                      0
                    );
                    return `Sum of ${selectedStocks.map(s => s.name).join(", ")} (Total Overflow: ${totalOverflow})`;
                  }
                })()}
              </h3>
              <button
                onClick={() => setShowPlotPanel(false)}
                style={{
                  padding: "8px 12px",
                  backgroundColor: "#dc3545",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <Line
                data={{
                  labels: simulationHistory.map((step) => `Step ${step.step}`),
                  datasets: [
                    {
                      label: plotMode === "single" ? "Simulation Amount" : "Sum of Simulation Amounts",
                      data: simulationHistory.map((step) => {
                        if (plotMode === "single") {
                          // Enhanced debug logging with type information
                          console.log(
                            `Looking for stock ${selectedStockForPlot} (type: ${typeof selectedStockForPlot}) in step ${
                              step.step
                            }`,
                            {
                              availableStocks: step.stocks.map(
                                (s) => `${s.id} (type: ${typeof s.id})`
                              ),
                              selectedStockForPlot,
                              stocksRaw: step.stocks,
                            }
                          );

                          // Try both string and number comparison since HTML select values are strings
                          const stock = step.stocks.find(
                            (s) =>
                              s.id === selectedStockForPlot || // Exact match
                              String(s.id) === String(selectedStockForPlot) // String conversion match
                          );

                          console.log(
                            stock
                              ? `Found stock ${stock.name} with amount ${stock.simulationAmount}`
                              : `Stock not found for ID ${selectedStockForPlot}`
                          );

                          return stock
                            ? Number(
                                parseFloat(stock.simulationAmount).toFixed(3)
                              )
                            : 0;
                        } else {
                          // Sum mode: calculate sum of all selected stocks
                          const selectedStocks = step.stocks.filter((s) =>
                            selectedStocksForSum.includes(String(s.id))
                          );
                          
                          const totalAmount = selectedStocks.reduce(
                            (sum, stock) => sum + (parseFloat(stock.simulationAmount) || 0),
                            0
                          );
                          
                          return Number(totalAmount.toFixed(3));
                        }
                      }),
                      borderColor: "rgb(75, 192, 192)",
                      backgroundColor: "rgba(75, 192, 192, 0.2)",
                      tension: 0.1,
                    },
                    {
                      label: plotMode === "single" ? "Overflow Amount" : "Sum of Overflow Amounts",
                      data: simulationHistory.map((step) => {
                        if (plotMode === "single") {
                          // Find the stock in this step
                          const stock = step.stocks.find(
                            (s) =>
                              s.id === selectedStockForPlot || // Exact match
                              String(s.id) === String(selectedStockForPlot) // String conversion match
                          );

                          // Return the overflow amount if it exists, otherwise 0
                          return stock && stock.overflowAmount
                            ? Number(parseFloat(stock.overflowAmount).toFixed(3))
                            : 0;
                        } else {
                          // Sum mode: calculate sum of all selected stocks' overflow
                          const selectedStocks = step.stocks.filter((s) =>
                            selectedStocksForSum.includes(String(s.id))
                          );
                          
                          const totalOverflow = selectedStocks.reduce(
                            (sum, stock) => sum + (parseFloat(stock.overflowAmount) || 0),
                            0
                          );
                          
                          return Number(totalOverflow.toFixed(3));
                        }
                      }),
                      borderColor: "rgb(255, 99, 132)",
                      backgroundColor: "rgba(255, 99, 132, 0.2)",
                      tension: 0.1,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    title: {
                      display: true,
                      text: "Stock Simulation and Overflow Amounts",
                    },
                    legend: {
                      display: true,
                    },
                    tooltip: {
                      callbacks: {
                        footer: (tooltipItems) => {
                          // Get the step index from the label
                          const stepIndex =
                            parseInt(
                              tooltipItems[0].label.replace("Step ", "")
                            ) - 1;
                          if (
                            stepIndex >= 0 &&
                            stepIndex < simulationHistory.length
                          ) {
                            const step = simulationHistory[stepIndex];
                            
                            if (plotMode === "single") {
                              const stock = step.stocks.find(
                                (s) =>
                                  s.id === selectedStockForPlot ||
                                  String(s.id) === String(selectedStockForPlot)
                              );
                              if (stock) {
                                const capacity =
                                  stock.capacity !== undefined
                                    ? stock.capacity
                                    : "unlimited";
                                return `Capacity: ${capacity}`;
                              }
                            } else {
                              // Sum mode: show capacities of all selected stocks
                              const selectedStocks = step.stocks.filter((s) =>
                                selectedStocksForSum.includes(String(s.id))
                              );
                              
                              const capacityInfo = selectedStocks.map((stock) => {
                                const capacity = stock.capacity !== undefined ? stock.capacity : "unlimited";
                                return `${stock.name}: ${capacity}`;
                              }).join(", ");
                              
                              return `Capacities: ${capacityInfo}`;
                            }
                          }
                          return "";
                        },
                      },
                    },
                  },
                  scales: {
                    x: {
                      display: true,
                      title: {
                        display: true,
                        text: "Simulation Steps",
                      },
                    },
                    y: {
                      display: true,
                      title: {
                        display: true,
                        text: "Amount Values",
                      },
                    },
                  },
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaperCanvas;
