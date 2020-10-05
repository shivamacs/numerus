const $ = jQuery = require('jquery');
const fsp = require('fs').promises;
const electron = require('electron');
// to communicate with main.js (where Electron window is initialised)
const { ipcRenderer } = electron;
// to display native system dialogs for opening and saving files, alerting, etc.
const dialog = electron.remote.dialog;

// receive messages from main.js file and perform required function
ipcRenderer.on('open-file', () => { openFile() })
.on('save-file', () => { saveFile() })
.on('select-all-cells', () => { $('#tl-cell').trigger('click') })

// rows is an array of cell objects which have their data and properties
let rows = [], preventKeyDown = false;

$(function() {
    // scrolling behaviour like professional spreadsheet applications (controlling the row and column headers)
    $('.content').on('scroll', function() {
        $('.first-row').css('top', $(this).scrollTop());
        $('.first-col').css('left', $(this).scrollLeft());
        $('#tl-cell').css('top', $(this).scrollTop());
        $('#tl-cell').css('left', $(this).scrollLeft());
    })

    deselectAll();    

    // prepare a default spreadsheet
    $('.grid').find('.row').each(function() {
        let cells = [];
        $(this).find('.data-cell').each(function() {
            let cell = getDefaultCell();
            cells.push(cell);

            prepareCellSpan(cell, this);
        })

        rows.push(cells);
    })

    // ResizeObserver API observe changes to the dimensions of row headers and column headers
    // and accordingly change the width or height of cells in a particular row or column
    var resizeObserver = new ResizeObserver(function(entries) {
        for(let entry of entries) {
            let item = entry.target;
            
            if($(item).attr("id")) {
                // if item is a column header (A, B, C, D etc.), update width of all cells in this column
                if($(item).attr("id") >= "A") {
                    let ci = parseInt($(item).attr("id").charCodeAt(0) - "A".charCodeAt(0));
                    $(`.data-cell[data-y=${ci}]`).css('width', $(item).width());

                    for(let i = 0; i < 100; i++) {
                        rows[i][ci]["width"] = $(item).width();
                    }
                } else { // if item is a row header (1, 2, 3, 4 etc.), update height of all cells in this row
                    let ri = parseInt($(item).attr("id"));
                    $(`.data-cell[data-x=${ri}]`).css('height', $(item).height());

                    for(let j = 0; j < 26; j++) {
                        rows[ri][j]["height"] = $(item).height();
                    }
                }
            }
        }
    });

    // get all the headers
    let headers = document.querySelectorAll('.column-header, .row-header');
    // observe resize on these headers
    headers.forEach((header) => resizeObserver.observe(header));

    /* event handlers to detect change and update properties of a cell */
    //--------------------------------------------------------------------------------------------------
    $('#font-family').on('change', function() {
        let fontFamily = $(this).val();
        applyProperty('font-family', fontFamily, 'fontFamily', fontFamily);
    })

    $('#font-size').on('change', function() {
        let fontSize = $(this).val();
        applyProperty('font-size', fontSize, 'fontSize', fontSize);
    })

    $('#bold').on('click', function() {
        $(this).toggleClass('selected');

        let bold = $(this).hasClass('selected');
        applyProperty('font-weight', bold ? 'bold' : 'normal', 'bold', bold);
    })

    $('#italic').on('click', function() {
        $(this).toggleClass('selected');

        let italic = $(this).hasClass('selected');
        applyProperty('font-style', italic ? 'italic' : 'normal', 'italic', italic);
    })

    $('#underline').on('click', function() {
        $(this).toggleClass('selected');

        let underline = $(this).hasClass('selected');
        applyProperty('text-decoration', underline ? 'underline' : 'none', 'underline', underline);
    })

    $('#bg-color').on('change', function() {
        let bgColor = $(this).val();
        applyProperty('background-color', bgColor, 'bgColor', bgColor);
    })

    $('#text-color').on('change', function() {
        let textColor = $(this).val();
        applyProperty('color', textColor, 'textColor', textColor);
    })

    $('.valign').on('click', function() {
        // if already selected, deselect and set default value
        if($(this).hasClass('selected')) {
            $(this).removeClass('selected');
        
            applyProperty('-webkit-box-align', 'end', 'valign', 'end');
            return;
        }

        $('.valign').removeClass('selected');
        $(this).addClass('selected');

        let valign = $(this).attr('prop-val');
        applyProperty('-webkit-box-align', valign, 'valign', valign);
    })

    $('.halign').on('click', function() {
        // if already selected, deselect and set default value
        if($(this).hasClass('selected')) {
            $(this).removeClass('selected');
        
            applyProperty('-webkit-box-pack', 'start', 'halign', 'start');
            return;
        }

        $('.halign').removeClass('selected');
        $(this).addClass('selected');

        let halign = $(this).attr('prop-val');
        applyProperty('-webkit-box-pack', halign, 'halign', halign);
    })
    //--------------------------------------------------------------------------------------------------

    // detect keypress in cell range input box, basically, keypress is used here to detect when enter key is pressed 
    $('#range').on('keypress', function(event) {
        if(event.type === 'keypress' && event.which === 13) {
            if($(this).val().length <= 5) {
                let rh = $(this).val().substr(1), ch = $(this).val().split('')[0].toUpperCase();
                let [ri, ci] = getCellPositionFromName(rh, ch);
                // click the cell whose position is entered in the range input box
                $(`.data-cell[data-x=${ri}][data-y=${ci}]`).trigger('click');
            }
        }
    })

    // detect focus or input in formula bar to maintain link between the content of selected cell
    // and the content of formula bar
    $('#formula').on('focus input', function() {
        let rh = parseInt($('#range').val().substr(1));
        let ch = $('#range').val().split('')[0].toUpperCase();
        let [ri, ci] = getCellPositionFromName(rh, ch);
        let cellSpan = `.data-cell[data-x=${ri}][data-y=${ci}]`;
        let cell = rows[ri][ci];
        let formula = $('#formula').val();

        $(cellSpan).trigger('dblclick', false);
        $(cellSpan).text(formula);
        cell.val = $(cellSpan).text();
    }).on('blur keypress', function(event) { // on blur or enter key press in formula bar, apply the formula to selected cell
        if(event.type === 'blur' || (event.type === 'keypress' && event.which === 13)) {
            let formula = $(this).val();

            // if text does not begin with '=', donot process it as a formula, simply return.
            if(formula[0] !== '=') {
                return;
            }
            
            // apply the formula to the cells which are to be edited or if multiple cells are selected
            $('.data-cell[contenteditable=true], .data-cell.multiple').each(function() {
                let [ri, ci] = getCellPosition(this)

                // remove any previous formula from the given cell, remove all its dependencies on other cells and vice versa
                if(rows[ri][ci].formula) {
                    removeFormula(ri, ci);
                }

                // setup formula property of the cell and setup dependencies with other cells depending upon the formula
                setupFormula(ri, ci, formula);
                // evaluate the cell formula using its property setup in the above step
                let nval = evaluateFormula(ri, ci);
                // update the cell values and all its dependencies
                updateVal(ri, ci, nval, true);
            })
        }
    })

    // the leftmost corner cell, when clicked selects all the cells
    $('#tl-cell').on('dblclick', function() {
        $('.data-cell.multiple').removeClass('multiple');

        $('.first-row .cell').addClass('selected');
        $('.first-col .row-header').addClass('selected');
        
        $('.data-cell').addClass('multiple');
    })
    
    // select all cells of a row when its row header is clicked
    $('.row-header').on('click', function(event) {
        deselectAll();

        // if Ctrl key is not pressed, then deselect the previous selected cells
        if(!event.ctrlKey) {
            $('.data-cell.multiple').removeClass('multiple');
            $(this).addClass('selected');
            $('.first-row .cell').addClass('selected');
        }
        
        // select the given row cells
        let ri = parseInt($(this).attr("id"));
        $(`.data-cell[data-x=${ri}]`).addClass('multiple');
        $(`.data-cell[data-x=${ri}]:first`).addClass('selected');
    })

    // select all cells of a column when its column header is clicked
    $('.column-header').on('click', function(event) {
        deselectAll();

        // if Ctrl key is not pressed, then deselect the previous selected cells
        if(!event.ctrlKey) {
            $('.data-cell.multiple').removeClass('multiple');
            $(this).addClass('selected');
            $('.first-row .row-header').addClass('selected');
        }
    
        // select the given column cells
        let ci = parseInt($(this).attr("id").charCodeAt(0) - "A".charCodeAt(0));
        $(`.data-cell[data-y=${ci}]`).addClass('multiple');
        $(`.data-cell[data-y=${ci}]:first`).addClass('selected');
    })

    // handle click and double click event on a cell
    $('.data-cell').on('click dblclick', function(event, focus, keydown) {
        // if Ctrl key is not pressed and the cell is editable, then prevent cell movement with arrow keys
        if(!event.ctrlKey && isCellEditable(this)) {
            if(keydown) {
                preventKeyDown = false;
            } else {
                preventKeyDown = true;
            }
            return;
        }

        // make editable cells non editable (editability of a cell can be switched any time)
        $('.data-cell[contenteditable=true]').css('cursor', 'cell');
        $('.data-cell[contenteditable=true]').attr('contenteditable', 'false');
        
        // get the cell which is clicked
        let [ri, ci] = getCellPosition(this);
        let [rh, ch] = getCellNameAttributes(ri, ci);
        let cell = rows[ri][ci];
        
        // handle single click
        if(event.type === 'click') {
            cellSelectionHandler(event, this, cell, rh, ch);
        }

        // handle double click
        if(event.type === 'dblclick') {
            cellFocusHandler(this, focus, keydown);
        }

        // update range input box
        $('#range').val(ch + rh);
        
        // update formula bar with the value of the selected cell or its formula (if any)
        if(cell.formula) {
            $('#formula').val('=' + cell.formula);
        } else {
            $('#formula').val(cell.val);
        }
    })

    // handle focus and input events of a cell
    $('.data-cell').on('focus input', function(event) {
        // if cell is editable, then remove its border selection
        if(isCellEditable(this)) {
            $(this).removeClass('selected');
        }

        // get the current cell from rows[]
        let [ri, ci] = getCellPosition(this);
        let cell = rows[ri][ci];

        // update formula bar simultaneously
        if(cell.formula) {
            $('#formula').val('=' + cell.formula);
        } else {
            $('#formula').val($(this).text());
        }

        // before any input is given, clear previous data of this cell
        if(event.type === 'focus') {
            if(isCellEditable(this)) {
                if (document.body.createTextRange) {
                    range = document.body.createTextRange();
                    range.moveToElementText(this);
                    range.select();
                } else if (window.getSelection) {
                    selection = window.getSelection();
                    range = document.createRange();
                    range.selectNodeContents(this);
                    selection.removeAllRanges();
                    selection.addRange(range);
                }
            }
        }

        if(event.type === 'input') {
            // remove the formula immediately (if any) and update the new cell value
            if(cell.formula) {
                $('#formula').val('');
                removeFormula(ri, ci);
            }

            // update all the other cells dependent on the current cell
            updateVal(ri, ci, $(this).text(), false);
        }
    }).on('blur', function() {
        let [ri, ci] = getCellPosition(this);
        let val = $(this).text();

        // if cell content starts with '=', then process it as a formula and place the final result into the cell
        if(val[0] == '=') {
            setupFormula(ri, ci, val);
            let nval = evaluateFormula(ri, ci);
            updateVal(ri, ci, nval, true);
        }
    })

    // detect key events on a selected cell
    $('.data-cell').on('keydown', function(event) {
        let [ri, ci] = getCellPosition(this);
        let key = event.which;

        // if key pressed is Tab, Enter, Escape, left arrow, right arrow, up arrow, down arrow
        if([9, 13, 27, 37, 38, 39, 40].includes(key)) {  
            // if cell is currently in editable mode, then do not allow keypress events to interfere 
            // unless key pressed is either Enter or Tab
            if(isCellEditable(this) && key !== 13 && key !== 9 && preventKeyDown) {
                return;
            }
            
            // So, if the key pressed is either Enter or Tab, make the cell non editable 
            if(isCellEditable(this)) {
                makeCellNonEditable(this);
            }
            
            // prevent default behaviour of the keys
            event.preventDefault();
            
            // move the cell depending on the key pressed, arrow key movement is obvious, Enter shifts selection down
            // Tab shifts selection right
            if(key === 37) {
                ci -= 1;
            } else if(key === 38) {
                ri -= 1;
            } else if(key === 9 || key === 39) {
                ci += 1;
            } else {
                ri += 1;
            }

            // if new position is not a valid position, return
            if(ri < 0 || ri > 1000 || ci < 0 || ci > 25) {
                return;
            }

            // click the required cell to according to movement
            $(`.data-cell[data-x=${ri}][data-y=${ci}]`).trigger('click');
        } 
        // alphanumeric keys when pressed make the current cell to start taking input 
        else if(key === 32 || (key >= 48 && key <= 57) || (key >= 65 && key <= 120) || (key >= 186 && key <= 222)) {
            // if not Ctrl key is pressed, start taking the input. Double click is triggered here as the action is to
            // make the cell editable
            if(!event.ctrlKey) {
                $(`.data-cell[data-x=${ri}][data-y=${ci}]`).trigger('dblclick', true);
            }
        }
    })

    // when the application is opened, the first cell (A1) is selected by default
    $('.data-cell:first').trigger('click');
})

// to handle task - open an existing file
async function openFile() {
    // show a open file dialog where user can choose a file
    let dialogObj = await dialog.showOpenDialog();

    // if operation is cancelled, return
    if(dialogObj.canceled)
        return;

    // read the file selected
    let data = await fsp.readFile(dialogObj.filePaths[0]);
    // convert the file into JSON data, as the file contains cell objects
    rows = JSON.parse(data);

    // fill the data in the spreadsheet by rendering data of each cell
    let ri = 0;
    $('.grid').find('.row').each(function() {
        let ci = 0;
        $(this).find('.data-cell').each(function() {
            let cell = rows[ri][ci];
            prepareCellSpan(cell, this);
            ci++;
        })
        ri++;
    })

    $('.data-cell:first').trigger('click');
}

// to handle task - save a file
async function saveFile() {
    // show a save file dialog where user can type a filename and save it
    let dialogObj = await dialog.showSaveDialog();

    if(dialogObj.canceled)
        return;

    // write the rows[] to file 
    await fsp.writeFile(dialogObj.filePath, JSON.stringify(rows));
}

// apply a property to a cell or group of cells
function applyProperty(property, val, propertyAttr, attrVal) {
    $('.data-cell.selected, .data-cell[contenteditable=true], .data-cell.multiple').css(property, val);
    $('.data-cell.selected, .data-cell[contenteditable=true], .data-cell.multiple').each(function() {
        let [ri, ci] = getCellPosition(this);
        rows[ri][ci][propertyAttr] = attrVal;
    })
}

// parse and set the formula of a cell and create dependencies in the form of a directed graph data structure
// we can check and remove circular dependencies through toplogical sort (not implemented here)
function setupFormula(ri, ci, formula) {
    let cell = rows[ri][ci];

    formula = formula.substr(1);
    cell.formula = formula;
    // remove all the parenthesis
    formula = formula.replace('(', '').replace(')', '');

    // get components in the formula (dependencies, cell nodes)
    let comps = formula.split(' ');

    // for each component
    for(let i = 0; i < comps.length; i++) {
        comps[i][0] = comps[i][0].toUpperCase();
        
        // if the component is valid
        if(comps[i].charCodeAt(0) >= "A".charCodeAt(0) && comps[i].charCodeAt(0) <= "Z".charCodeAt(0)) {
            let [uri, uci] = getCellPositionFromName(comps[i].substr(1), comps[i][0]);
            
            // upstream property of a cell refers to an array of cells on which a given cell depends
            // these components are going to define the value of this cell, so add them in upstream
            cell.upstream.push({
                ri: uri, ci: uci
            })

            let upstCell = rows[uri][uci];
            // downstream property of a cell refers to an array of cells which are dependent on a given cell
            // the current cell is dependent on the components of the formula, so add the current cell to the
            // downstream of each component
            upstCell.downstream.push({
                ri: ri, ci: ci
            })
        }
    }
}

// remove any pre-existing formula and dependencies from a cell
function removeFormula(ri, ci) {
    let cell = rows[ri][ci];
    cell.formula = '';

    // for each upstream cell, remove the current cell from their downstreams
    for(let i = 0; i < cell.upstream.length; i++) {
        let upstObj = cell.upstream[i];
        let upstCell = rows[upstObj.ri][upstObj.ci];
        
        for(let j = 0; j < cell.downstream.length; j++) {
            let dwnstObj = upstCell.downstream[j];
            if(dwnstObj.ri == ri && dwnstObj.ci == ci) {
                upstCell.downstream.splice(j, 1);
                break;
            }
        }
    }

    // clear the upstream of the current cell
    cell.upstream = [];
}

// evaluate the value of a cell formula
function evaluateFormula(ri, ci) {
    let cell = rows[ri][ci];
    let formula = cell.formula;

    // replace the components in the formula by their values
    for(let i = 0; i < cell.upstream.length; i++) {
        let upstrObj = cell.upstream[i];
        let upstCell = rows[upstrObj.ri][upstrObj.ci];

        let [rh, ch] = getCellNameAttributes(upstrObj.ri, upstrObj.ci);
        formula = formula.replace(ch + rh, upstCell.val || 0);
    }

    // evaluate the converted expression using inbuilt eval() function
    // we can also calculate the result using infix evaluation method (uses a stack)
    return eval(formula);
}

// reflect the changed values in the cell dependencies
function updateVal(ri, ci, val, render) {
    let cell = rows[ri][ci];
    cell.val = val;

    // is the value is to be rendered
    if(render) {
        $(`.data-cell[data-x=${ri}][data-y=${ci}]`).text(val);
    }

    // update the value in each downstream cell
    for(let i = 0; i < cell.downstream.length; i++) {
        let dwnstObj = cell.downstream[i];

        // work recursively to reach all nodes
        let nval = evaluateFormula(dwnstObj.ri, dwnstObj.ci);
        updateVal(dwnstObj.ri, dwnstObj.ci, nval, true);
    }
}

// deselect row header, column header and cell
function deselectAll() {
    $('.column-header.selected, .row-header.selected').removeClass('selected');
    $('.data-cell.selected').removeClass('selected');
}

// return the default cell object
function getDefaultCell() {
    return {
        val: '',
        fontFamily: 'Product Sans Regular',
        fontSize: '14',
        bold: false,
        italic: false,
        underline: false,
        bgColor: '#FFFFFF',
        textColor: '#000000',
        valign: 'end',
        halign: 'left',
        formula: '',
        upstream: [],
        downstream: [],
        height: 20,
        width: 90
    }
}

// prepare a cell <span></span> by setting all the properties in UI
function prepareCellSpan(cell, cellSpan) {
    $(cellSpan).html(cell.val);
    $(cellSpan).css({'font-family':cell.fontFamily,
                     'font-size':cell.fontSize + 'px', 
                     'font-weight':(cell.bold ? 'bold' : 'normal'),
                     'font-style':(cell.italic ? 'italic' : 'normal'),
                     'text-decoration':(cell.underline ? 'underline' : 'none'),
                     'background-color':cell.bgColor,
                     'color':cell.textColor,
                     '-webkit-box-pack':cell.halign,
                     '-webkit-box-align': cell.valign,
                     'height': cell.height,
                     'width': cell.width
                    });

    let [ri, ci] = getCellPosition(cellSpan);

    // set the height and width of row and column headers according to the cells
    $( `.row-header[id=${ri}]`).css('height', cell.height);
    $(`.column-header[data-y=${ci}]`).css('width', cell.width);
}

// return cell indices if cell HTML element is provided
function getCellPosition(cellSpan) {
    let ri = parseInt($(cellSpan).attr('data-x'));
    let ci = parseInt($(cellSpan).attr('data-y'));

    return [ri, ci];
}

// convert cell name to cell indices (parameters in terms of row header and column header, ex - 10, E)
function getCellPositionFromName(rh, ch) {
    return [parseInt(rh) - 1, parseInt(ch.charCodeAt(0) - "A".charCodeAt(0))]
}

// convert cell indices to cell name
function getCellNameAttributes(ri, ci) {
    return [(parseInt(ri) + 1).toString(), 
            String.fromCharCode("A".charCodeAt(0) + parseInt(ci))];
}

// return true if cell can be edited, otherwise false
function isCellEditable(cellSpan) {
    return $(cellSpan).attr('contenteditable') === 'true';
}

// to make the cell non editable temporarily
function makeCellNonEditable(cellSpan) {
    $(cellSpan).attr('contenteditable', 'false');
    $(cellSpan).css('cursor', 'cell');
}

// when a cell is clicked single time
function cellSelectionHandler(event, cellSpan, cell, rh, ch) {
    deselectAll();
    
    // add border selection to the cell
    $(cellSpan).addClass('selected');
    // Focus the cell to listen for keydown and other events
    $(cellSpan).trigger('focus');

    // if Ctrl key is not pressed, deselect the previous multiple selection
    if(!event.ctrlKey) {
        $('.data-cell.multiple').removeClass('multiple');
    } else { 
        // otherwise, add the current cell into multiple selection. If already a part of multiple selection, deselect it
        $(cellSpan).toggleClass('multiple');
    }

    // if Ctrl key is not pressed or there is only one cell in multiple selection, highlight the row header and column header.
    // When a cell is clicked, its row header and column header are shown as selected
    // filter function helps in finding out the matching row and column headers 
    if(!event.ctrlKey || $('.data-cell.multiple').length === 1) {
        $(`.first-row .cell:contains(${ch})`).filter(function() {
            return $(this).text() === ch;
        }).addClass('selected');
        $(`.first-col .row-header:contains(${rh})`).filter(function() {
            return $(this).text() === rh;
        }).addClass('selected');
    }

    /* show the cell properties in UI */
    //--------------------------------------------------------------------------------------------------
    $('#font-family').val(cell.fontFamily);
    $('#font-size').val(cell.fontSize);

    if(cell.bold) {
        $('#bold').addClass('selected');
    } else {
        $('#bold').removeClass('selected');
    }

    if(cell.italic) {
        $('#italic').addClass('selected');
    } else {
        $('#italic').removeClass('selected');
    }

    if(cell.underline) {
        $('#underline').addClass('selected');
    } else {
        $('#underline').removeClass('selected');
    }

    $('#bg-color').val(cell.bgColor);
    $('#text-color').val(cell.textColor);

    $('.valign').removeClass('selected');
    $(`.valign[prop-val=${cell.valign}`).addClass('selected');
    
    $('.halign').removeClass('selected');
    $(`.halign[prop-val=${cell.halign}`).addClass('selected');
    //--------------------------------------------------------------------------------------------------
}

// when the cell is focus (double clicked)
function cellFocusHandler(cellSpan, focus) {
    // remove cell selection and make it editable
    $(cellSpan).removeClass('selected');
    $(cellSpan).attr('contenteditable', 'true');
    $(cellSpan).css('cursor', 'text');

    // focus is an additional parameter to provide focus to the cell explicitly if required
    if(focus) {
        $(cellSpan).trigger('focus');
    }
}
