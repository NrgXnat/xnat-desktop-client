<!DOCTYPE html>
<html lang="en">
<?php include_once "include/header.php"; ?>
<body>

  <header>
    <a href="home.php" class="logo-header"><img src="assets/images/logo-header.png"></a>
    <div class="menu-holder">
      <a href="#" class="menu">MENU</a>
      <div class="menu-dropdown">
        <a href="home.php">Home</a>
        <a href="upload.php">Upload</a>
        <a href="download.php">Download</a>
        <a href="monitor.php" class="monitor">Monitor</a>
      </div>
    </div>
    <div class="server-name">XNATserver1.com</div>
    <a href="connection-settings.php" class="settings"><i class="fas fa-cog"></i></a>
    <div class="user-holder">
      <a href="#" class="user"><span class="name">Welcome Admin</span> <i class="fas fa-user"></i></a>
      <div class="user-dropdown">
       <span class="username">
         admin@xw2017-01.xnat.org
       </span>
       <a class="btn btn-blue" href="login-known.php">Logout</a>
     </div>
   </div>
 </header>
 <div class="container-fluid">
   <div class="row">
     <h2 class="main-title">Upload Image Session to ( XNAT Name )</h2>
     <h3 class="step-description">Project: ( Project label ), Subject( Subject label )</h3>
     <nav>
      <div class="nav nav-tabs" id="nav-tab" role="tablist">
        <a class="nav-item nav-link"  data-toggle="tab" href="#nav-project" role="tab" aria-controls="nav-project" aria-selected="true">Project / Subject Selected</a>
        <a class="nav-item nav-link active" data-toggle="tab" href="#nav-folder" role="tab" aria-controls="nav-folder" aria-selected="false">Select Folder</a>
        <a class="nav-item nav-link disabled" data-toggle="tab" href="#nav-date" role="tab" aria-controls="nav-date" aria-selected="false">Verify Visit Date</a>
        <a class="nav-item nav-link disabled" data-toggle="tab" href="#nav-verify" role="tab" aria-controls="nav-verify" aria-selected="false">Review and Verify Selected Session Information</a>
        <a class="nav-item nav-link disabled" data-toggle="tab" href="#nav-summary" role="tab" aria-controls="nav-summary" aria-selected="false">Summary</a>
      </div>
    </nav>
    <div class="tab-content" id="nav-tabContent">
      <div class="tab-pane fade" id="nav-project" role="tabpanel" aria-labelledby="nav-home-tab">
        <h2 class="section-title">Select project to which you will upload session</h2>
        <div class="filter-control">
          <input type="text" id="upload-project-filter" onkeyup="myFunction()" placeholder="Filter" class="form-control">
        </div>
        <ul id="upload-project" class="choose-list">
          <li><a href="#">XNAT_1</a></li>
          <li><a href="#">XNAT_2</a></li>
          <li><a href="#">XNAT_3</a></li>
          <li><a href="#">XNAT_4</a></li>
          <li><a href="#">XNAT_5</a></li>
          <li><a href="#">XNAT_6</a></li>
          <li><a href="#">XNAT_7</a></li>
        </ul>
        <h2 class="section-title">Select the subject for the session to be upload</h2>
        <div class="filter-control">
          <input type="text" id="subject-session-filter" onkeyup="myFunction()" placeholder="Filter" class="form-control">
        </div>
        <ul id="subject-session" class="choose-list">
          <li><a href="#">Subject_1</a></li>
          <li><a href="#">Subject_2</a></li>
          <li><a href="#">Subject_3</a></li>
          <li><a href="#">Subject_4</a></li>
          <li><a href="#">Subject_5</a></li>
          <li><a href="#">Subject_6</a></li>
          <li><a href="#">Subject_7</a></li>
        </ul>
        <div class="row">
          <div class="col text-right button-row">
            <button class="btn btn-blue" type="button" data-toggle="modal" data-target="#new-subject">Create new subject</button>
          </div>
        </div>
        <div class="row">
          <div class="col text-right button-row">
            <button type="button" class="btn btn-gray" type="button" >Cancel</button>
            <button type="button" class="btn btn-blue">Next <i class="fas fa-angle-right"></i></button>
          </div>
        </div>
      </div>
      <div class="tab-pane fade show active" id="nav-folder" role="tabpanel" aria-labelledby="nav-folder-tab"> 
        <h2 class="section-title">Select folder of files to upload</h2>
        <input type="file" multiple webkitdirectory id="fileURL"/>
        <ul id="fileOutput"></ul>
        <div class="col text-right button-row">
          <button type="button" class="btn btn-gray">Cancel</button>
          <button type="button" class="btn btn-gray" type="button" ><i class="fas fa-angle-left"></i> Prev</button>
          <button type="button" class="btn btn-blue">Next <i class="fas fa-angle-right"></i></button>
        </div>
      </div>
      <div class="tab-pane fade" id="nav-date" role="tabpanel" aria-labelledby="nav-date-tab">
        <h2 class="section-title">Enter the visit details of the session you plan to upload</h2>
        <div class="form-group">
          <label>Verify session date</label>
          <div class="row">
            <div class="col-3 date-holder">
              <input type="text" id="datepicker" class="form-control">
              
            </div>
          </div>
        </div>

        <p>Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo. Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem. Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur. Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse quam nihil molestiae consequatur, vel illum qui dolorem eum fugiat quo voluptas nulla pariatur.</p>
        <div class="col text-right button-row">
          <button type="button" class="btn btn-gray">Cancel</button>
          <button type="button" class="btn btn-gray" type="button" ><i class="fas fa-angle-left"></i> Prev</button>
          <button type="button" class="btn btn-blue">Next <i class="fas fa-angle-right"></i></button>
        </div>
      </div>
      <div class="tab-pane fade" id="nav-verify" role="tabpanel" aria-labelledby="nav-home-tab">
        <h2 class="section-title">Please confirm the scans to be included.</h2>
        <table class="table table-bordered" id="table1"        
        data-toggle="table"
        data-height="300">
        <thead>
          <tr>
            <th data-field="select" data-checkbox="true">Upload</th>
            <th data-field="description"  data-sortable="true">Series Description</th>
            <th data-field="quality"  data-sortable="false" data-escape="false">Quality label</th>
            <th data-field="note" data-escape="false" data-escape="false" data-align="center">Scan-level notes</th>
            <th data-field="count"  data-sortable="true">File count</th>
            <th data-field="size"  data-sortable="true">Size (bytes)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td></td>
            <td><div class="folder-name">Lorem ipsum dolor sit amet</div></td>
            <td>
              <div class="quality-holder">
                <select>
                  <option value="" disabled selected>Quality label</option>
                  <option value="Excellent">Excellent</option>
                  <option value="Good">Good</option>
                  <option value="Medium">Medium</option>
                  <option value="Bad">Bad</option>
                </select>
              </div>
            </td>
            <td><button class="btn btn-blue" type="button" data-toggle="modal" data-target="#note">Edit note</td>
            <td>3</td>
            <td>1.17 MB</td>
          </tr>
          <tr>
            <td></td>
            <td><div class="folder-name">Lorem ipsum dolor sit amet</div></td>
            <td>
              <div class="quality-holder">
                <select>
                  <option value="" disabled selected>Quality label</option>
                  <option value="Excellent">Excellent</option>
                  <option value="Good">Good</option>
                  <option value="Medium">Medium</option>
                  <option value="Bad">Bad</option>
                </select>
              </div>
            </td>
            <td><button class="btn btn-blue" type="button" data-toggle="modal" data-target="#note">Add note</td>
            <td>9</td>
            <td>1.16 MB</td>
          </tr>
          <tr>
            <td></td>
            <td><div class="folder-name">Lorem ipsum dolor sit amet</div></td>
            <td>
             <div class="quality-holder">
              <select>
                <option value="" disabled selected>Quality label</option>
                <option value="Excellent">Excellent</option>
                <option value="Good">Good</option>
                <option value="Medium">Medium</option>
                <option value="Bad">Bad</option>
              </select>
            </div>
          </td>
          <td><button class="btn btn-blue" type="button" data-toggle="modal" data-target="#note">Add note</td>
          <td>11</td>
          <td>1.15 MB</td>
        </tr>
        <tr>
          <td></td>
          <td><div class="folder-name">Lorem ipsum dolor sit amet</div></td>
          <td>
            <div class="quality-holder">
              <select>
                <option value="" disabled selected>Quality label</option>
                <option value="Excellent">Excellent</option>
                <option value="Good">Good</option>
                <option value="Medium">Medium</option>
                <option value="Bad">Bad</option>
              </select>
            </div>
          </td>
          <td><button class="btn btn-blue" type="button" data-toggle="modal" data-target="#note">Add note</td>
          <td>4</td>
          <td>1.14 MB</td>
        </tr>
        <tr>
          <td></td>
          <td><div class="folder-name">Lorem ipsum dolor sit amet</div></td>
          <td>
            <div class="quality-holder">
              <select>
                <option value="" disabled selected>Quality label</option>
                <option value="Excellent">Excellent</option>
                <option value="Good">Good</option>
                <option value="Medium">Medium</option>
                <option value="Bad">Bad</option>
              </select>
            </div>
          </td>
          <td><button class="btn btn-blue" type="button" data-toggle="modal" data-target="#note">Add note</td>
          <td>7</td>
          <td>1.13 MB</td>
        </tr>
        <tr>
          <td></td>
          <td><div class="folder-name">Lorem ipsum dolor sit amet</div></td>
          <td>
           <div class="quality-holder">
            <select>
              <option value="" disabled selected>Quality label</option>
              <option value="Excellent">Excellent</option>
              <option value="Good">Good</option>
              <option value="Medium">Medium</option>
              <option value="Bad">Bad</option>
            </select>
          </div>
        </td>
        <td><button class="btn btn-blue" type="button" data-toggle="modal" data-target="#note">Edit note</td>
        <td>5</td>
        <td>1.13 MB</td>
      </tr>
      <tr>
        <td></td>
        <td><div class="folder-name">Lorem ipsum dolor sit amet</div></td>
        <td>
          <div class="quality-holder">
            <select>
              <option value="" disabled selected>Quality label</option>
              <option value="Excellent">Excellent</option>
              <option value="Good">Good</option>
              <option value="Medium">Medium</option>
              <option value="Bad">Bad</option>
            </select>
          </div>
        </td>
        <td><button class="btn btn-blue" type="button" data-toggle="modal" data-target="#note">Add note</td>
        <td>3</td>
        <td>1.13 MB</td>
      </tr>
    </tbody>
  </table>
  <p>Note: Unchecked scans will not be uploaded</p>
  <div class="row">
    <div class="col">
      <p><b>Session summary</b></p>
      <p>DICOM_session MR1<br/>
        Accession: Flith<br/>
        Description: XNAT_01<br/>
        Modality: MR<br/>
        10 scans in 84 files ( 11.0 MB )
      </p>
    </div>
    <div class="col">
      <div class="form-group">
        <label><b>Session notes</b></label>
        <textarea placeholder="Add Note" rows="4"></textarea>
      </div>
    </div>
  </div>
  <div class="row">
    <div class="col text-right button-row">
      <button type="button" class="btn btn-gray">Cancel</button>
      <button type="button" class="btn btn-gray" type="button" ><i class="fas fa-angle-left"></i> Prev</button>
      <button type="button" class="btn btn-blue">Upload</button>
    </div>
  </div>
</div>
<div class="tab-pane fade" id="nav-summary" role="tabpanel" aria-labelledby="nav-profile-tab">
  <h2 class="section-title">XNAT_01_01 was successfuly uploaded to the archive</h2>
  <div class="row">
    <div class="col button-row">
      <button class="btn btn-blue" type="button" data-toggle="modal" data-target="#new-subject">Click here to finish archiving the data</button>
    </div>
  </div>
  <div class="row">
    <div class="col text-right button-row">
      <button type="button" class="btn btn-gray" type="button" >Cancel</button>
      <button type="button" class="btn btn-gray" type="button" >Home</button>
      <button type="button" class="btn btn-blue">Finish</button>
    </div>
  </div>
</div>
</div>

</div>
</div>
<!-- Modal -->
<div class="modal fade" id="new-subject" tabindex="-1" role="dialog" aria-labelledby="subject-new" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered modal-lg" role="document">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title" id="exampleModalLongTitle">Create new Subject</h5>
        <button type="button" class="close" data-dismiss="modal" aria-label="Close">
          <i class="far fa-window-close"></i>
        </button>
      </div>
      <div class="modal-body">
       <form>
         <div class="row">
          <div class="col">
            <label class="col-form-label">Primary Project:</label>
          </div>
          <div class="col">
            XNAT_02
          </div>
        </div>
        <div class="form-group">
          <div class="row">
            <div class="col">
              <label class="col-form-label">Subject’s ID within this project:</label>
            </div>
            <div class="col">
              <input type="text" class="form-control">
            </div>
          </div>
        </div>
        <div class="form-group">
          <div class="row">
           <div class="col">
            <label class="col-form-label">Subject’s research group within this project:</label>
          </div>
          <div class="col">
            <input type="text" class="form-control">
          </div>
        </div>
      </div>
    </form>
  </div>
  <div class="modal-footer">
    <button type="button" class="btn btn-gray" type="button" data-dismiss="modal">Cancel</button>
    <button type="button" class="btn btn-blue">Add New Subject</button>
  </div>
</div>
</div>
</div>
<!-- Modal -->
<div class="modal fade" id="note" tabindex="-1" role="dialog" aria-labelledby="note" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered modal-lg" role="document">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title" id="exampleModalLongTitle">Add Note</h5>
        <button type="button" class="close" data-dismiss="modal" aria-label="Close">
          <i class="far fa-window-close"></i>
        </button>
      </div>
      <div class="modal-body">
       <form>
         <div class="row">
          <div class="col">
            <textarea placeholder="Add Note" rows="5"></textarea>
          </div>
        </div>
      </form>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-blue">Add Note</button>
    </div>
  </div>
</div>
</div>


<?php include_once "include/footer.php"; ?>